/**
 * Deterministic dev sample values for metrics (no Math.random → no hydration mismatch).
 * Used only when the BFF isn't configured, so the depth visualisations are visible in development.
 * Money values are in MINOR units (INR paise); percent as 0–100; ratio/qty as numbers.
 */
import type { MetricId } from '@/lib/metrics/registry'
import type { SurfaceSummary } from '@/components/metric/surface-types'

const SAMPLE: Record<MetricId, number> = {
  realized_revenue: 425_00_000_00,
  cm2: 138_00_000_00,
  cm2_margin: 32.5,
  orders: 1842,
  aov: 23_08_00,
  mer: 3.4,
  rto_rate: 18.2,
  cod_share: 61,
  prepaid_share: 39,
  refund_rate: 4.1,
  ltv: 78_00_00,
  cac: 5_40_00,
  ltv_cac: 3.1,
  repeat_rate: 27.5,
  churn_rate: 12.3,
  new_customers: 1240,
  returning_customers: 602,
  spend: 125_00_000_00,
  roas: 4.1,
  ctr: 1.8,
  cpm: 2_10_00,
  cpc: 12_00,
  conversions: 980,
  sessions: 84_200,
  conversion_rate: 2.4,
  delivered_rate: 78.5,
  ndr_rate: 9.7,
  inventory_cover: 24,
  stockouts: 7,
}

// Stable per-metric delta (−15%..+15%) derived from the id so SSR and client agree.
function stableDelta(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000
  return Math.round((h / 1000) * 30 - 15) / 100
}

export function sampleSummary(metrics: MetricId[]): SurfaceSummary {
  const m: Partial<Record<MetricId, number>> = {}
  const d: Partial<Record<MetricId, number>> = {}
  for (const id of metrics) {
    m[id] = SAMPLE[id]
    d[id] = stableDelta(id)
  }
  return { metrics: m, deltas: d, asOf: 'today' }
}
