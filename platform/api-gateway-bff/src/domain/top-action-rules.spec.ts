import { describe, expect, it } from 'vitest'
import { deriveTopActions, THRESHOLDS, type MetricInput } from './top-action-rules'
import type { SourceFreshness } from './recommendation-gate'

const fresh: SourceFreshness[] = [
  { stream: 'orders', lagMinutes: 5 },
  { stream: 'ad_spend', lagMinutes: 30 },
]

const metric = (id: string, value: number): MetricInput => ({ id, value, estimated: false })

describe('deriveTopActions (deterministic, evidence-carrying)', () => {
  it('flags high RTO as the most urgent action', () => {
    const actions = deriveTopActions([metric('rto_rate', 22), metric('mer', 1.4), metric('spend', 100_000)], fresh)
    expect(actions[0].type).toBe('logistics.review_courier_rules')
    expect(actions[0].evidence).toEqual({ rto_rate: 22 })
    expect(actions[0].severity).toBe(3)
  })

  it('flags low MER only when there is actual spend', () => {
    expect(deriveTopActions([metric('mer', 1.2), metric('spend', 0)], fresh)).toHaveLength(0)
    const actions = deriveTopActions([metric('mer', 1.2), metric('spend', 50_000)], fresh)
    expect(actions[0].type).toBe('ads.review_budget_allocation')
  })

  it('judges the funnel only with real traffic', () => {
    const noTraffic = deriveTopActions([metric('conversion_rate', 0.4), metric('sessions', 50)], fresh)
    expect(noTraffic).toHaveLength(0)
    const withTraffic = deriveTopActions([metric('conversion_rate', 0.4), metric('sessions', 500)], fresh)
    expect(withTraffic[0].type).toBe('web.review_checkout_funnel')
  })

  it('turns a day-stale source into an integration action that does NOT self-block on staleness', () => {
    const actions = deriveTopActions([], [{ stream: 'ad_spend', lagMinutes: 26 * 60 }])
    expect(actions[0].type).toBe('integrations.fix_connection')
    expect(actions[0].sources).toEqual([]) // gating it on the stale source would self-block
  })

  it('emits nothing when every figure is healthy (no manufactured urgency)', () => {
    const healthy = [
      metric('rto_rate', 5),
      metric('mer', 4),
      metric('spend', 100_000),
      metric('conversion_rate', 2.5),
      metric('sessions', 1000),
    ]
    expect(deriveTopActions(healthy, fresh)).toHaveLength(0)
  })

  it('ranks by severity then confidence', () => {
    const actions = deriveTopActions(
      [
        metric('rto_rate', THRESHOLDS.rtoRatePct + 1),
        metric('mer', 1),
        metric('spend', 1),
        metric('conversion_rate', 0.5),
        metric('sessions', 300),
      ],
      [{ stream: 'orders', lagMinutes: 25 * 60 }],
    )
    expect(actions.map((a) => a.severity)).toEqual([...actions.map((a) => a.severity)].sort((a, b) => b - a))
  })
})
