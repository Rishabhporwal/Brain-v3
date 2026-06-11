import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TopActionsService } from './top-actions.service'
import type { FreshnessService } from './freshness.service'
import type { RecommendationGateService } from './recommendation-gate.service'
import type { RecommendationCandidate, GateVerdict } from '../domain/recommendation-gate'

const BRAND = '0197604e-32a5-7000-8000-000000000000'

function build(gateImpl?: (c: RecommendationCandidate) => GateVerdict) {
  const freshness = { forBrand: vi.fn().mockResolvedValue([{ stream: 'shipments', lagMinutes: 10 }]) }
  const gate = {
    evaluate: vi.fn(async (_slug: string, _brand: string, candidates: RecommendationCandidate[]) =>
      candidates.map((candidate) => ({
        candidate,
        verdict: gateImpl?.(candidate) ?? {
          allowed: true,
          approvalLevel: 'admin' as const,
          reasons: [],
          staleSources: [],
        },
      })),
    ),
  }
  const svc = new TopActionsService(
    freshness as unknown as FreshnessService,
    gate as unknown as RecommendationGateService,
  )
  return { svc, gate }
}

describe('TopActionsService', () => {
  beforeEach(() => {
    process.env.METRIC_ENGINE_URL = 'http://engine.test'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          brand_id: BRAND,
          period: {},
          computed_at: '2026-06-11T12:00:00Z',
          metrics: [
            { id: 'rto_rate', value: 22, unit: 'percent', formula_version: 1, estimated: false },
            { id: 'mer', value: 1.2, unit: 'ratio', formula_version: 1, estimated: false },
            { id: 'spend', value: 100_000, unit: 'minor_units', formula_version: 1, estimated: false },
          ],
        }),
      }),
    )
  })

  afterEach(() => {
    delete process.env.METRIC_ENGINE_URL
    vi.unstubAllGlobals()
  })

  it('produces gated, ranked actions from trusted figures (max three)', async () => {
    const { svc, gate } = build()
    const res = await svc.forBrand('acme', BRAND)
    expect(res.source).toBe('metric-engine')
    expect(res.actions.map((a) => a.type)).toEqual(['logistics.review_courier_rules', 'ads.review_budget_allocation'])
    expect(gate.evaluate).toHaveBeenCalled() // decision-log write happens inside the gate service
  })

  it('counts withheld actions instead of surfacing them', async () => {
    const { svc } = build(() => ({
      allowed: false,
      approvalLevel: 'owner',
      reasons: ['kill_switch'],
      staleSources: [],
    }))
    const res = await svc.forBrand('acme', BRAND)
    expect(res.actions).toHaveLength(0)
    expect(res.withheld).toBe(2)
  })

  it('produces NOTHING without a metric engine — never from un-trusted numbers', async () => {
    delete process.env.METRIC_ENGINE_URL
    const { svc, gate } = build()
    const res = await svc.forBrand('acme', BRAND)
    expect(res).toMatchObject({ actions: [], source: 'unavailable' })
    expect(gate.evaluate).not.toHaveBeenCalled()
  })
})
