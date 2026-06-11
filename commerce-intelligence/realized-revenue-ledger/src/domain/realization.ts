/**
 * PURE realization state machine (Solution Architecture §6.2). Revenue is not known when an
 * order is placed: it travels placed → confirmed → delivered → settled and can fall out via
 * cancellation, refund, or RTO over a ~45-day window. This module derives the authoritative
 * state for one order from the joined facts (order + payments + shipments); the reconciliation
 * job re-runs it on a schedule, and re-runs simply replace the ledger row (corrections to
 * closed periods are new versions, never silent mutations).
 */

export type RealizationState =
  | 'placed' // ordered, nothing realized yet
  | 'delivered' // delivered (and paid where payment facts exist) — realized
  | 'cancelled' // cancelled/voided before fulfilment
  | 'refunded' // payment refunded (full)
  | 'rto' // returned to origin — the COD killer
  | 'lost' // shipment lost — not realized

export interface OrderFacts {
  orderId: string
  revenueMinor: number // order total in minor units
  financialStatus: string // provider-agnostic: paid | pending | refunded | voided | …
  shipmentStatus: string | null // canonical ShipmentRecord status, null = no shipment fact yet
  refundedMinor: number // sum of refunded payment facts for this order
}

export interface LedgerEntry {
  state: RealizationState
  realized: boolean
  realizedRevenueMinor: number
}

const CANCELLED_FINANCIAL = new Set(['voided', 'cancelled', 'declined', 'expired'])
const REFUNDED_FINANCIAL = new Set(['refunded'])
const NOT_YET_REALIZED_FINANCIAL = new Set(['pending', 'partially_refunded'])

export function deriveLedgerEntry(o: OrderFacts): LedgerEntry {
  // 1. Hard fall-outs first — these end the order's revenue life regardless of shipping.
  if (CANCELLED_FINANCIAL.has(o.financialStatus)) return out('cancelled')
  if (REFUNDED_FINANCIAL.has(o.financialStatus)) return out('refunded')
  if (o.shipmentStatus === 'rto' || o.shipmentStatus === 'rto_delivered') return out('rto')
  if (o.shipmentStatus === 'lost') return out('lost')

  // 2. Full refund recorded on the payment rail even if the order status lags the provider.
  if (o.refundedMinor >= o.revenueMinor && o.revenueMinor > 0) return out('refunded')

  // 3. Delivered survives the fall-out window → realized (net of any partial refunds).
  if (o.shipmentStatus === 'delivered') {
    const net = Math.max(0, o.revenueMinor - o.refundedMinor)
    return { state: 'delivered', realized: true, realizedRevenueMinor: net }
  }

  // 4. Not yet delivered: nothing is realized yet — placed revenue is NOT realized revenue
  //    (BRD §3.5: realized over placed). The pre-ledger heuristic counted paid orders
  //    immediately; the ledger is stricter and this is exactly the honesty upgrade.
  void NOT_YET_REALIZED_FINANCIAL
  return out('placed')
}

function out(state: Exclude<RealizationState, 'delivered'>): LedgerEntry {
  return { state, realized: false, realizedRevenueMinor: 0 }
}
