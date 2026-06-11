import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Pool } from 'pg'
import type { ClickHouseClient } from '@clickhouse/client'
import { CH_CLIENT, PG_POOL } from '../persistence/db.providers'
import { toSourceFreshness, type SourceFreshness } from '../domain/recommendation-gate'

/**
 * Per-brand, per-stream evidence freshness from the live ClickHouse tables. Feeds two surfaces:
 * the integration-health view (BRD §13: lag must be visible) and the recommendation gate
 * (BRD §21.1: stale evidence withholds/escalates). Lag = now − max(ingest timestamp).
 */
@Injectable()
export class FreshnessService {
  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(CH_CLIENT) private readonly ch: ClickHouseClient,
  ) {}

  async forBrand(slug: string): Promise<SourceFreshness[]> {
    const brandId = await this.brandId(slug)
    const result = await this.ch.query({
      // toString(): ClickHouse JSON output of DateTime64 is already a string; keep it explicit.
      query: `
        SELECT 'orders'    AS stream, toString(max(ingested_at)) AS latest FROM brain.orders    WHERE brand_id = {brand:UUID}
        UNION ALL
        SELECT 'payments'  AS stream, toString(max(ingested_at)) AS latest FROM brain.payments  WHERE brand_id = {brand:UUID}
        UNION ALL
        SELECT 'shipments' AS stream, toString(max(ingested_at)) AS latest FROM brain.shipments WHERE brand_id = {brand:UUID}
        UNION ALL
        SELECT 'ad_spend'  AS stream, toString(max(pulled_at))   AS latest FROM brain.ad_spend  WHERE brand_id = {brand:UUID}`,
      query_params: { brand: brandId },
      clickhouse_settings: { brain_current_brand: brandId }, // tenant row policy (§1.5)
      format: 'JSONEachRow',
    })
    const rows = (await result.json()) as Array<{ stream: string; latest: string }>
    return toSourceFreshness(rows, new Date())
  }

  private async brandId(slug: string): Promise<string> {
    const { rows } = await this.pg.query<{ id: string }>(`SELECT id FROM platform.brands WHERE slug=$1 LIMIT 1`, [slug])
    if (!rows[0]) throw new NotFoundException('unknown workspace')
    return rows[0].id
  }
}
