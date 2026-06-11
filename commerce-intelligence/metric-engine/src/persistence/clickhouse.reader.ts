import { Inject, Injectable, Provider } from '@nestjs/common'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import type { RawAggregates } from '../domain/formulas'

export const CH_CLIENT = 'CH_CLIENT'

export const chProvider: Provider = {
  provide: CH_CLIENT,
  useFactory: (): ClickHouseClient =>
    createClient({
      url: process.env.CH_URL ?? 'http://localhost:8125',
      username: process.env.CH_USER ?? 'default',
      password: process.env.CH_PASSWORD ?? '',
    }),
}

/** Optional period bounds (ISO dates). Omitted = all-time, matching the console's current behavior. */
export interface Period {
  from?: string
  to?: string
}

/**
 * The engine's only data source — brand-scoped reads of the live ClickHouse facts. The realization
 * filter is THE registry definition (realized_revenue): keep it in lockstep with the formula book.
 */
@Injectable()
export class ClickhouseReader {
  // Mirrors registry.yaml realized_revenue: a non-realized financial state excludes the order.
  private static readonly REALIZED = `financial_status NOT IN ('voided','refunded','pending','cancelled','partially_refunded','declined','expired')`

  constructor(@Inject(CH_CLIENT) private readonly ch: ClickHouseClient) {}

  async aggregates(brandId: string, period: Period = {}): Promise<RawAggregates> {
    const [ordersRealized, pixelPurchases, pixel, adSpend, factSpend, payments, shipments] = await Promise.all([
      this.one<{ orders: string; revenue_minor: string }>(
        `SELECT countIf(${ClickhouseReader.REALIZED}) AS orders,
                toInt64(round(toFloat64(sumIf(total_price, ${ClickhouseReader.REALIZED})) * 100)) AS revenue_minor
           FROM brain.orders FINAL WHERE brand_id = {b:UUID} ${this.bounds('ordered_at', period)}`,
        brandId,
        period,
      ),
      this.one<{ orders: string; revenue_minor: string }>(
        `SELECT countIf(event_type='purchase') AS orders,
                toInt64(round(sumIf(toFloat64OrZero(JSONExtractString(props,'value')), event_type='purchase'))) AS revenue_minor
           FROM brain.customer_events WHERE brand_id = {b:UUID} ${this.bounds('ts', period)}`,
        brandId,
        period,
      ),
      this.one<{ sessions: string; conversions: string }>(
        `SELECT uniqExact(session_id) AS sessions, countIf(event_type='checkout_completed') AS conversions
           FROM brain.customer_events WHERE brand_id = {b:UUID} ${this.bounds('ts', period)}`,
        brandId,
        period,
      ),
      this.one<{ spend: string }>(
        `SELECT sum(spend_minor) AS spend FROM brain.ad_spend FINAL WHERE brand_id = {b:UUID} ${this.bounds('date', period)}`,
        brandId,
        period,
      ),
      this.one<{ spend: string }>(
        `SELECT sum(spend_minor) AS spend FROM brain.fact_spend WHERE brand_id = {b:UUID} ${this.bounds('date', period)}`,
        brandId,
        period,
      ),
      this.one<{ captured: string }>(
        `SELECT sum(amount_minor) AS captured FROM brain.payments FINAL WHERE brand_id = {b:UUID} AND status='captured' ${this.bounds('created_at', period)}`,
        brandId,
        period,
      ),
      this.one<{ total: string; rto: string }>(
        `SELECT count() AS total, countIf(status IN ('rto','rto_delivered','undelivered')) AS rto
           FROM brain.shipments FINAL WHERE brand_id = {b:UUID} ${this.bounds('updated_at', period)}`,
        brandId,
        period,
      ),
    ])
    return {
      ordersRealized: {
        orders: Number(ordersRealized?.orders ?? 0),
        revenueMinor: Number(ordersRealized?.revenue_minor ?? 0),
      },
      pixelPurchases: {
        orders: Number(pixelPurchases?.orders ?? 0),
        revenueMinor: Number(pixelPurchases?.revenue_minor ?? 0),
      },
      pixel: { sessions: Number(pixel?.sessions ?? 0), conversions: Number(pixel?.conversions ?? 0) },
      adSpendMinor: Number(adSpend?.spend ?? 0),
      factSpendMinor: Number(factSpend?.spend ?? 0),
      paymentsCapturedMinor: Number(payments?.captured ?? 0),
      shipments: { total: Number(shipments?.total ?? 0), rto: Number(shipments?.rto ?? 0) },
    }
  }

  private bounds(column: string, period: Period): string {
    const parts: string[] = []
    if (period.from) parts.push(`AND ${column} >= parseDateTimeBestEffort({from:String})`)
    if (period.to) parts.push(`AND ${column} < parseDateTimeBestEffort({to:String})`)
    return parts.join(' ')
  }

  private async one<T>(query: string, brandId: string, period: Period): Promise<T | undefined> {
    try {
      const res = await this.ch.query({
        query,
        query_params: { b: brandId, from: period.from ?? '', to: period.to ?? '' },
        clickhouse_settings: { brain_current_brand: brandId }, // tenant row policy (§1.5)
        format: 'JSONEachRow',
      })
      const rows = (await res.json()) as T[]
      return rows[0]
    } catch {
      // A missing table (e.g. fact_spend on a fresh cluster) must not take the whole read down.
      return undefined
    }
  }
}
