import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import type { ClickHouseClient } from '@clickhouse/client'
import { CH_CLIENT, PG_POOL } from './db.providers'

/**
 * First-party event ingest (M1). Authenticated by the **write-key** the SDK was issued in step 4 —
 * NOT by a Keycloak session — because the browser SDK fires it cross-origin. We resolve the brand
 * from `tracking.tracking_keys`, then append a row to `brain.customer_events` (ClickHouse), scoped by
 * the `brain_current_brand` row-policy setting. This is the real data that `verifyTracking` confirms.
 */
@Injectable()
export class TrackService {
  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(CH_CLIENT) private readonly ch: ClickHouseClient,
  ) {}

  private async brandForKey(writeKey: string): Promise<{ id: string; region: string }> {
    const { rows } = await this.pg.query<{ id: string; region: string }>(
      `SELECT b.id, b.region FROM tracking.tracking_keys k
         JOIN platform.brands b ON b.id = k.brand_id
        WHERE k.write_key = $1 AND k.status = 'active' LIMIT 1`,
      [writeKey],
    )
    if (!rows[0]) throw new UnauthorizedException('invalid or revoked write-key')
    return rows[0]
  }

  /** Ingest one event. `writeKey` comes from the `x-brain-key` header (preferred) or the body. */
  async ingest(writeKey: string | undefined, body: Record<string, unknown>) {
    const key = writeKey ?? (typeof body.writeKey === 'string' ? body.writeKey : undefined)
    if (!key) throw new BadRequestException('missing write-key (x-brain-key header or body.writeKey)')
    const brand = await this.brandForKey(key)

    const eventType = typeof body.event === 'string' ? body.event : 'custom'
    const anonymousId = typeof body.anonymousId === 'string' ? body.anonymousId : randomUUID()
    const props = body.props && typeof body.props === 'object' ? body.props : {}

    await this.ch.insert({
      table: 'brain.customer_events',
      format: 'JSONEachRow',
      values: [
        {
          brand_id: brand.id,
          event_id: randomUUID(),
          event_type: eventType,
          source: typeof body.source === 'string' ? body.source : 'sdk',
          customer_id: typeof body.customerId === 'string' ? body.customerId : null,
          anonymous_id: anonymousId,
          session_id: typeof body.sessionId === 'string' ? body.sessionId : null,
          ts: new Date().toISOString().replace('T', ' ').replace('Z', ''),
          consent_state: typeof body.consent === 'string' ? body.consent : 'granted',
          region: brand.region,
          props: JSON.stringify(props),
          schema_version: '1',
        },
      ],
      clickhouse_settings: { brain_current_brand: brand.id },
    })
    return { ok: true, brandId: brand.id, eventType }
  }
}
