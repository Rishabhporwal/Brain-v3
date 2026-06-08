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
 * Local stack runs a single BFF replica so a plain in-process interval is safe. In a multi-replica prod
 * deployment this needs leader election / a distributed lock (Redis) or a dedicated worker so the interval
 * fires once, not once-per-replica. SYNC_SCHEDULER_ENABLED=false turns it off.
 */
@Injectable()
export class SyncSchedulerService {
  private readonly log = new Logger(SyncSchedulerService.name)
  private running = false

  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    private readonly pull: PullService,
  ) {}

  @Interval('pull-sync', SYNC_INTERVAL_MS)
  async tick(): Promise<void> {
    if (process.env.SYNC_SCHEDULER_ENABLED === 'false') return
    if (this.running) return // skip if the previous cycle is still in flight (no overlap)
    this.running = true
    try {
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
