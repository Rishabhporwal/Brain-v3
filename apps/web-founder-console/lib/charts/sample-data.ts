/**
 * Deterministic dev sample data for the chart/table kit (no Math.random → stable SSR/CSR).
 * Used only when the BFF is unconfigured so the depth visualisations are visible in development.
 * Money values are in MINOR units (INR paise).
 */

// Small deterministic pseudo-random in [0,1) from an integer seed.
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const WEEKS = Array.from({ length: 12 }, (_, i) => `W${i + 1}`)

/** Time series: one row per week, a numeric column per series key. Money keys in minor units. */
export function sampleTimeSeries(keys: string[], points = 12): Array<Record<string, number | string>> {
  const labels = WEEKS.slice(0, points)
  return labels.map((label, i) => {
    const row: Record<string, number | string> = { label }
    keys.forEach((key, k) => {
      const base = 30_000_000 + k * -8_000_000 // money minor units (~₹3L), lower for secondary series
      const wave = 1 + 0.35 * rnd(i * 7 + k * 13) + 0.04 * i
      row[key] = Math.round(base * wave)
    })
    return row
  })
}

/** Time series of quantities (sessions, orders) — small scale, not money. */
export function sampleTimeSeriesQty(keys: string[], points = 12): Array<Record<string, number | string>> {
  const labels = WEEKS.slice(0, points)
  return labels.map((label, i) => {
    const row: Record<string, number | string> = { label }
    keys.forEach((key, k) => {
      row[key] = Math.round((1500 + k * -400) * (1 + 0.4 * rnd(i * 7 + k * 13) + 0.05 * i))
    })
    return row
  })
}

/** Horizontal breakdown: label → value (money minor units by default). */
export function sampleBreakdown(labels: string[], scale = 12_000_000): Array<{ label: string; value: number }> {
  return labels
    .map((label, i) => ({ label, value: Math.round(scale * (0.4 + rnd(i * 5 + 3))) }))
    .sort((a, b) => b.value - a.value)
}

/** Horizontal breakdown of a percentage (0–100). */
export function sampleBreakdownPct(labels: string[]): Array<{ label: string; value: number }> {
  return labels
    .map((label, i) => ({ label, value: Math.round((8 + rnd(i * 5 + 3) * 30) * 10) / 10 }))
    .sort((a, b) => b.value - a.value)
}

/** Quantity breakdown (orders, customers). */
export function sampleBreakdownQty(labels: string[], scale = 1200): Array<{ label: string; value: number }> {
  return labels
    .map((label, i) => ({ label, value: Math.round(scale * (0.3 + rnd(i * 5 + 3))) }))
    .sort((a, b) => b.value - a.value)
}

export type WaterfallStep = { label: string; value: number; kind: 'start' | 'add' | 'subtract' | 'total' }

/** CM waterfall from revenue to CM2 (money minor units). */
export function sampleWaterfall(): WaterfallStep[] {
  return [
    { label: 'Net Revenue', value: 425_00_000_00, kind: 'start' },
    { label: 'COGS', value: -178_00_000_00, kind: 'subtract' },
    { label: 'Shipping', value: -32_00_000_00, kind: 'subtract' },
    { label: 'Payment & COD', value: -14_00_000_00, kind: 'subtract' },
    { label: 'RTO & Returns', value: -41_00_000_00, kind: 'subtract' },
    { label: 'Marketing', value: -22_00_000_00, kind: 'subtract' },
    { label: 'CM2', value: 138_00_000_00, kind: 'total' },
  ]
}

/** Heatmap: rows (e.g. cohorts) × columns (e.g. months), value 0–100. */
export function sampleHeatmap(
  rowLabels: string[],
  colLabels: string[],
): { rowLabels: string[]; colLabels: string[]; values: number[][] } {
  const values = rowLabels.map((_, r) =>
    colLabels.map((__, c) =>
      c > rowLabels.length - r ? 0 : Math.round(100 * Math.max(0, 0.85 - c * 0.12 - rnd(r * 9 + c) * 0.1)),
    ),
  )
  return { rowLabels, colLabels, values }
}

/** Sample fallback for the BFF detail endpoint (used when no backend is configured). */
export function sampleDetail(): {
  timeseries: Array<{ label: string; realized_revenue: number; orders: number; sessions: number }>
  breakdown: Array<{ label: string; value: number }>
  rows: Array<{ sku: string; orders: number; revenue: number }>
  paymentBreakdown: Array<{ label: string; value: number }>
  courierBreakdown: Array<{ label: string; value: number }>
  waterfall: WaterfallStep[]
} {
  const timeseries = WEEKS.slice(0, 8).map((label, i) => ({
    label,
    realized_revenue: Math.round(30_000_000 * (1 + 0.3 * rnd(i) + 0.05 * i)),
    orders: Math.round(120 * (0.6 + rnd(i + 3))),
    sessions: Math.round(5000 * (0.6 + rnd(i + 7))),
  }))
  const rows = ['Daily Serum', 'Vitamin C', 'Sunscreen', 'Face Wash', 'Night Cream'].map((sku, i) => ({
    sku,
    orders: Math.round(80 * (0.5 + rnd(i))),
    revenue: Math.round(6_000_000 * (0.5 + rnd(i + 2))),
  }))
  return {
    timeseries,
    breakdown: [],
    rows,
    paymentBreakdown: [
      { label: 'prepaid', value: 62 },
      { label: 'cod', value: 38 },
    ],
    courierBreakdown: sampleBreakdownQty(['Delhivery', 'Bluedart', 'Ekart', 'XpressBees'], 60),
    waterfall: sampleWaterfall(),
  }
}

/** Generic sample rows for a table from a column→generator map. */
export function sampleRows<T extends Record<string, unknown>>(
  n: number,
  gen: (i: number, r: (seed: number) => number) => T,
): T[] {
  return Array.from({ length: n }, (_, i) => gen(i, (s) => rnd(i * 17 + s)))
}
