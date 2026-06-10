/**
 * Typed client for the Tier-0 metric engine. Invariant 1: only the engine produces a business
 * figure — services call this client; they never re-implement a formula. Returns null when the
 * engine is unreachable so callers can fall back/degrade explicitly (never silently fabricate).
 */

export interface MetricValue {
  id: string
  value: number
  unit: 'minor_units' | 'count' | 'ratio' | 'percent'
  formula_version: number
  /** Produced from a fallback evidence path — the surface must label it. */
  estimated: boolean
}

export interface MetricsResponse {
  brand_id: string
  period: { from?: string; to?: string }
  computed_at: string
  metrics: MetricValue[]
}

export interface MetricClientOptions {
  baseUrl: string // e.g. http://metric-engine:7080
  token?: string // METRIC_ENGINE_TOKEN (x-internal-token)
  timeoutMs?: number
}

export class MetricClient {
  constructor(private readonly opts: MetricClientOptions) {}

  /** Fetch metric values; ids omitted = every registered metric. Null on transport failure. */
  async getMetrics(brandId: string, ids?: string[], period?: { from?: string; to?: string }): Promise<MetricsResponse | null> {
    const params = new URLSearchParams({ brand_id: brandId })
    if (ids?.length) params.set('ids', ids.join(','))
    if (period?.from) params.set('from', period.from)
    if (period?.to) params.set('to', period.to)
    try {
      const res = await fetch(`${this.opts.baseUrl}/metrics?${params}`, {
        headers: this.opts.token ? { 'x-internal-token': this.opts.token } : {},
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 5_000),
      })
      if (!res.ok) return null
      return (await res.json()) as MetricsResponse
    } catch {
      return null
    }
  }
}

/** Build a client from the conventional env seam, or null when no engine is configured. */
export function metricClientFromEnv(env: Record<string, string | undefined> = process.env): MetricClient | null {
  const baseUrl = env.METRIC_ENGINE_URL
  if (!baseUrl) return null
  return new MetricClient({ baseUrl, token: env.METRIC_ENGINE_TOKEN })
}
