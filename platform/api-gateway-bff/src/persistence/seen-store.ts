import { Inject, Injectable } from '@nestjs/common'
import { Pool } from 'pg'
import type { SeenStore } from '@brain/connector-kit'
import { PG_POOL } from './db.providers'

/**
 * Postgres-backed idempotency store (decision D4). `seen(key)` is an atomic insert: a fresh key inserts a
 * row and returns false; a redelivered key conflicts (no insert) and returns true. Keys are provider-scoped,
 * e.g. `shopify:<X-Shopify-Webhook-Id>`. Old rows are pruned by `received_at`.
 */
@Injectable()
export class PgSeenStore implements SeenStore {
  constructor(@Inject(PG_POOL) private readonly pg: Pool) {}

  async seen(key: string, brandId?: string | null): Promise<boolean> {
    const [provider, webhookId] = key.includes(':')
      ? [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
      : ['unknown', key]
    const { rowCount } = await this.pg.query(
      `INSERT INTO integration.webhook_receipts(provider, webhook_id, brand_id)
       VALUES ($1,$2,$3) ON CONFLICT (provider, webhook_id) DO NOTHING`,
      [provider, webhookId, brandId ?? null],
    )
    return rowCount === 0 // 0 inserted = already seen
  }
}
