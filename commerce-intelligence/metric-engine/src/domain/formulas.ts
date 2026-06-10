/**
 * PURE formula implementations — one per registry id, version-locked to the formula book
 * (contracts/metrics/registry.yaml; parity is asserted at boot and in CI). No I/O here: the
 * persistence layer fetches RawAggregates, these functions turn them into trusted figures.
 * Money in/out is ALWAYS integer minor units.
 */

export interface RawAggregates {
  ordersRealized: { orders: number; revenueMinor: number }
  pixelPurchases: { orders: number; revenueMinor: number }
  pixel: { sessions: number; conversions: number }
  adSpendMinor: number
  factSpendMinor: number
  paymentsCapturedMinor: number
  shipments: { total: number; rto: number }
}

export interface ComputedValue {
  value: number
  /** true when produced from a fallback evidence path — surfaces must label it (BRD §8.2). */
  estimated: boolean
}

export interface Formula {
  formula_version: number
  compute(raw: RawAggregates): ComputedValue | null // null = not computable from current data
}

const revenue = (raw: RawAggregates): ComputedValue | null => {
  if (raw.ordersRealized.orders > 0) return { value: raw.ordersRealized.revenueMinor, estimated: false }
  if (raw.pixelPurchases.orders > 0) return { value: raw.pixelPurchases.revenueMinor, estimated: true }
  return null
}

const orders = (raw: RawAggregates): ComputedValue | null => {
  if (raw.ordersRealized.orders > 0) return { value: raw.ordersRealized.orders, estimated: false }
  if (raw.pixelPurchases.orders > 0) return { value: raw.pixelPurchases.orders, estimated: true }
  return null
}

const spend = (raw: RawAggregates): ComputedValue | null => {
  if (raw.adSpendMinor > 0) return { value: raw.adSpendMinor, estimated: false }
  if (raw.factSpendMinor > 0) return { value: raw.factSpendMinor, estimated: false }
  return null
}

const mer = (raw: RawAggregates): ComputedValue | null => {
  const r = revenue(raw)
  const s = spend(raw)
  if (!r || !s || s.value === 0) return null
  return { value: Math.round((r.value / s.value) * 100) / 100, estimated: r.estimated || s.estimated }
}

export const FORMULAS: Record<string, Formula> = {
  realized_revenue: { formula_version: 1, compute: revenue },
  orders: { formula_version: 1, compute: orders },
  aov: {
    formula_version: 1,
    compute: (raw) => {
      const r = revenue(raw)
      const o = orders(raw)
      if (!r || !o || o.value === 0) return null
      return { value: Math.round(r.value / o.value), estimated: r.estimated || o.estimated }
    },
  },
  sessions: {
    formula_version: 1,
    compute: (raw) => (raw.pixel.sessions > 0 ? { value: raw.pixel.sessions, estimated: false } : null),
  },
  conversions: {
    formula_version: 1,
    compute: (raw) => (raw.pixel.conversions > 0 ? { value: raw.pixel.conversions, estimated: false } : null),
  },
  conversion_rate: {
    formula_version: 1,
    compute: (raw) => {
      if (raw.pixel.sessions === 0 || raw.pixel.conversions === 0) return null
      return { value: Math.round((raw.pixel.conversions / raw.pixel.sessions) * 1000) / 10, estimated: false }
    },
  },
  spend: { formula_version: 1, compute: spend },
  mer: { formula_version: 1, compute: mer },
  roas: { formula_version: 1, compute: mer }, // alias until attribution-engine provides per-channel credit
  payments_captured: {
    formula_version: 1,
    compute: (raw) => (raw.paymentsCapturedMinor > 0 ? { value: raw.paymentsCapturedMinor, estimated: false } : null),
  },
  rto_rate: {
    formula_version: 1,
    compute: (raw) => {
      if (raw.shipments.total === 0) return null
      return { value: Math.round((raw.shipments.rto / raw.shipments.total) * 1000) / 10, estimated: false }
    },
  },
}
