import { Inject, Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import type { Provider } from '@nestjs/common'
import { deriveLedgerEntry } from '../domain/realization'

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

interface JoinedOrderRow {
  brand_id: string
  provider: string
  order_id: string
  currency: string
  revenue_minor: string
  financial_status: string
  shipment_status: string
  refunded_minor: string
  ordered_at: string
}

/**
 * The slow-tail reconciliation job (Solution Architecture §6.2): joins order + payment + shipment
 * facts over the realization window, derives each order's state through the pure state machine,
 * and REPLACES the ledger rows (ReplacingMergeTree keyed by order; corrections to closed periods
 * are new versions). Runs on an interval and on demand per brand.
 */
@Injectable()
export class ReconciliationService {
  private readonly log = new Logger(ReconciliationService.name)
  private static readonly WINDOW_DAYS = 45

  constructor(@Inject(CH_CLIENT) private readonly ch: ClickHouseClient) {}

  /** Scheduled pass over every brand with orders inside the realization window. */
  @Interval(Number(process.env.RECONCILE_INTERVAL_SECONDS ?? 3600) * 1000)
  async reconcileAll(): Promise<void> {
    if ((process.env.RECONCILE_DISABLED ?? '').toLowerCase() === 'true') return
    try {
      const res = await this.ch.query({
        query: `SELECT DISTINCT toString(brand_id) AS brand_id FROM brain.orders FINAL
                 WHERE ordered_at > now() - INTERVAL ${ReconciliationService.WINDOW_DAYS} DAY`,
        format: 'JSONEachRow',
      })
      const brands = (await res.json()) as Array<{ brand_id: string }>
      for (const { brand_id } of brands) await this.reconcileBrand(brand_id)
    } catch (e) {
      this.log.warn(`scheduled reconciliation failed: ${(e as Error).message}`)
    }
  }

  /** Reconcile one brand's window: join facts → derive → replace ledger rows. Returns row count. */
  async reconcileBrand(brandId: string): Promise<{ orders: number; realized: number }> {
    const res = await this.ch.query({
      query: `
        SELECT
          toString(o.brand_id)                            AS brand_id,
          o.provider                                      AS provider,
          o.order_id                                      AS order_id,
          o.currency                                      AS currency,
          toString(toInt64(round(toFloat64(o.total_price) * 100))) AS revenue_minor,
          o.financial_status                              AS financial_status,
          coalesce(s.status, '')                          AS shipment_status,
          toString(coalesce(p.refunded_minor, 0))         AS refunded_minor,
          toString(o.ordered_at)                          AS ordered_at
        FROM brain.orders AS o FINAL
        LEFT JOIN (
          SELECT brand_id, order_ref, argMax(status, updated_at) AS status
            FROM brain.shipments FINAL GROUP BY brand_id, order_ref
        ) AS s ON s.brand_id = o.brand_id AND s.order_ref = o.order_id
        LEFT JOIN (
          SELECT brand_id, order_ref, sumIf(amount_minor, status = 'refunded') AS refunded_minor
            FROM brain.payments FINAL GROUP BY brand_id, order_ref
        ) AS p ON p.brand_id = o.brand_id AND p.order_ref = o.order_id
        WHERE o.brand_id = {b:UUID}
          AND o.ordered_at > now() - INTERVAL ${ReconciliationService.WINDOW_DAYS} DAY`,
      query_params: { b: brandId },
      clickhouse_settings: { brain_current_brand: brandId }, // tenant row policy (§1.5)
      format: 'JSONEachRow',
    })
    const rows = (await res.json()) as JoinedOrderRow[]
    if (rows.length === 0) return { orders: 0, realized: 0 }

    const reconciledAt = new Date().toISOString().replace('T', ' ').replace('Z', '')
    const ledgerRows = rows.map((r) => {
      const entry = deriveLedgerEntry({
        orderId: r.order_id,
        revenueMinor: Number(r.revenue_minor),
        financialStatus: r.financial_status,
        shipmentStatus: r.shipment_status || null,
        refundedMinor: Number(r.refunded_minor),
      })
      return {
        brand_id: r.brand_id,
        provider: r.provider,
        order_id: r.order_id,
        currency: r.currency,
        order_revenue_minor: Number(r.revenue_minor),
        refunded_minor: Number(r.refunded_minor),
        state: entry.state,
        realized: entry.realized ? 1 : 0,
        realized_revenue_minor: entry.realizedRevenueMinor,
        ordered_at: r.ordered_at,
        reconciled_at: reconciledAt,
      }
    })

    await this.ch.insert({
      table: 'brain.revenue_ledger',
      values: ledgerRows,
      format: 'JSONEachRow',
      clickhouse_settings: { brain_current_brand: brandId }, // tenant row policy (§1.5)
    })
    const realized = ledgerRows.filter((r) => r.realized === 1).length
    this.log.log(`reconciled brand=${brandId}: ${ledgerRows.length} orders, ${realized} realized`)
    return { orders: ledgerRows.length, realized }
  }

  /** Authoritative realized-revenue summary straight from the ledger. */
  async summary(
    brandId: string,
  ): Promise<{ realized_revenue_minor: number; orders: number; by_state: Record<string, number> }> {
    const res = await this.ch.query({
      query: `SELECT state, count() AS orders, sum(realized_revenue_minor) AS realized
                FROM brain.revenue_ledger FINAL WHERE brand_id = {b:UUID} GROUP BY state`,
      query_params: { b: brandId },
      clickhouse_settings: { brain_current_brand: brandId }, // tenant row policy (§1.5)
      format: 'JSONEachRow',
    })
    const rows = (await res.json()) as Array<{ state: string; orders: string; realized: string }>
    const byState: Record<string, number> = {}
    let total = 0
    let orders = 0
    for (const r of rows) {
      byState[r.state] = Number(r.orders)
      orders += Number(r.orders)
      total += Number(r.realized)
    }
    return { realized_revenue_minor: total, orders, by_state: byState }
  }
}
