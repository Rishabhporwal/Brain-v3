import type { MetricId } from '@/lib/metrics/registry'

/** Standard payload for a metrics surface served by the BFF read-model. */
export interface SurfaceSummary {
  /** Raw metric values: money in minor units, percent as 0–100, ratio as a number. */
  metrics: Partial<Record<MetricId, number>>
  /** Period-over-period change as a ratio (0.12 = +12%). */
  deltas?: Partial<Record<MetricId, number>>
  asOf?: string
}
