import { Inject, Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { Pool } from 'pg'
import { PG_POOL } from '../persistence/db.providers'
import { PullService } from './pull.service'

// Module-level (not a static field) so it's resolved before the @Interval decorator evaluates.
const SYNC_INTERVAL_MS = Math.max(15, Number(process.env.SYNC_INTERVAL_SECONDS ?? 120)) * 1000

/**
 * Polling-lane scheduler. Ad platforms (Google/Meta) have NO push API, so "real-time" = poll on a short
 * interval. This runs every SYNC_INTERVAL_SECONDS (default 120s), finds every connected pull integration
 * that has a vaulted token, and drives its connector through PullService.runSync — no manual trigger.
 *
 * Push providers (Shopify/Woo/Razorpay) are NOT here: they're event-driven (webhooks auto-registered on
 * connect → BFF → Kafka → ClickHouse), already real-time.
 *
 * Multi-replica safe: the `running` flag stops overlap WITHIN a replica; a Postgres advisory lock
 * (pg_try_advisory_lock — no extra infra, reuses the existing pool) makes only ONE replica run a given
 * tick across the fleet. A replica that can't grab the lock simply skips. SYNC_SCHEDULER_ENABLED=false
 * turns it off entirely.
 */
@Injectable()
export class SyncSchedulerService {
  private readonly log = new Logger(SyncSchedulerService.name)
  private running = false
  // Arbitrary-but-stable advisory-lock key shared by every replica (so they contend for the same lock).
  private static readonly LOCK_KEY = 4815162342

  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    private readonly pull: PullService,
  ) {}

  @Interval('pull-sync', SYNC_INTERVAL_MS)
  async tick(): Promise<void> {
    if (process.env.SYNC_SCHEDULER_ENABLED === 'false') return
    if (this.running) return // skip if the previous cycle is still in flight (no overlap within this replica)
    this.running = true
    // Leader election across replicas: hold a session-level advisory lock on a dedicated connection for the
    // whole cycle; if another replica holds it, skip this tick. Released in finally so a crash frees it.
    const client = await this.pg.connect()
    let locked = false
    try {
      const { rows } = await client.query<{ got: boolean }>('SELECT pg_try_advisory_lock($1) AS got', [
        SyncSchedulerService.LOCK_KEY,
      ])
      if (!rows[0]?.got) return // another replica is running this cycle
      locked = true
      const due = await this.duePulls()
      if (!due.length) return
      this.log.log(`sync tick: ${due.length} connected pull integration(s)`)
      for (const d of due) {
        try {
          await this.pull.runSync(d.provider, d.slug)
        } catch (e) {
          this.log.warn(`scheduled sync ${d.provider}/${d.slug} failed: ${(e as Error).message}`)
        }
      }
    } catch (e) {
      this.log.warn(`sync tick failed: ${(e as Error).message}`)
    } finally {
      if (locked) {
        try {
          await client.query('SELECT pg_advisory_unlock($1)', [SyncSchedulerService.LOCK_KEY])
        } catch {
          /* the lock auto-releases when the session ends if unlock fails */
        }
      }
      client.release()
      this.running = false
    }
  }

  /** Connected pull-lane integrations (google/meta) that actually hold a vaulted token. */
  private async duePulls(): Promise<Array<{ provider: string; slug: string }>> {
    const { rows } = await this.pg.query<{ provider: string; slug: string }>(
      `SELECT i.provider, b.slug
         FROM integration.integrations i
         JOIN platform.brands b ON b.id = i.brand_id
         JOIN integration.oauth_tokens t ON t.integration_id = i.id
        WHERE i.status = 'connected' AND i.provider IN ('google','meta')`,
    )
    return rows
  }
}
