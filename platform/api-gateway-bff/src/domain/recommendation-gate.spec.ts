import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GATE_POLICY,
  gateRecommendation,
  toSourceFreshness,
  type RecommendationCandidate,
  type SourceFreshness,
} from './recommendation-gate'

const fresh: SourceFreshness[] = [
  { stream: 'orders', lagMinutes: 5 },
  { stream: 'ad_spend', lagMinutes: 30 },
  { stream: 'shipments', lagMinutes: 2000 },
  { stream: 'payments', lagMinutes: null }, // never landed
]

const candidate = (over: Partial<RecommendationCandidate>): RecommendationCandidate => ({
  id: 'rec_1',
  type: 'ads.pause_campaign',
  riskLevel: 'low',
  confidence: 0.9,
  reversible: true,
  sources: ['ad_spend'],
  ...over,
})

describe('gateRecommendation', () => {
  it('passes a confident low-risk reversible recommendation as auto-eligible', () => {
    const v = gateRecommendation(candidate({}), fresh)
    expect(v).toEqual({ allowed: true, approvalLevel: 'auto', reasons: [], staleSources: [] })
  })

  it('kill switch withholds everything regardless of quality', () => {
    const v = gateRecommendation(candidate({}), fresh, { ...DEFAULT_GATE_POLICY, killSwitch: true })
    expect(v.allowed).toBe(false)
    expect(v.reasons).toEqual(['kill_switch'])
  })

  it('withholds below the confidence floor at any risk level', () => {
    const v = gateRecommendation(candidate({ confidence: 0.5 }), fresh)
    expect(v.allowed).toBe(false)
    expect(v.reasons[0]).toMatch(/^confidence_below_floor/)
  })

  it('withholds a HIGH-risk recommendation on stale evidence (BRD §21.1)', () => {
    // high risk tolerates 60min; shipments is 2000min stale
    const v = gateRecommendation(candidate({ riskLevel: 'high', sources: ['shipments'] }), fresh)
    expect(v.allowed).toBe(false)
    expect(v.staleSources).toEqual(['shipments'])
  })

  it('surfaces a LOW-risk recommendation on stale evidence but escalates approval and labels it', () => {
    // low risk tolerates 1440min; shipments at 2000min is stale → escalate auto→admin, keep visible
    const v = gateRecommendation(candidate({ sources: ['shipments'] }), fresh)
    expect(v.allowed).toBe(true)
    expect(v.approvalLevel).toBe('admin')
    expect(v.staleSources).toEqual(['shipments'])
  })

  it('treats a never-landed source as stale', () => {
    const v = gateRecommendation(candidate({ riskLevel: 'high', sources: ['payments'] }), fresh)
    expect(v.allowed).toBe(false)
    expect(v.staleSources).toEqual(['payments'])
  })

  it('non-reversible low-risk is never auto-eligible (BRD §18)', () => {
    const v = gateRecommendation(candidate({ reversible: false }), fresh)
    expect(v.approvalLevel).toBe('admin')
  })

  it('medium risk requires admin; high risk requires owner', () => {
    expect(gateRecommendation(candidate({ riskLevel: 'medium', sources: ['orders'] }), fresh).approvalLevel).toBe(
      'admin',
    )
    expect(gateRecommendation(candidate({ riskLevel: 'high', sources: ['orders'] }), fresh).approvalLevel).toBe('owner')
  })
})

describe('toSourceFreshness', () => {
  const now = new Date('2026-06-11T12:00:00Z')

  it('computes lag minutes from the latest timestamp', () => {
    expect(toSourceFreshness([{ stream: 'orders', latest: '2026-06-11 11:45:00' }], now)).toEqual([
      { stream: 'orders', lagMinutes: 15 },
    ])
  })

  it('maps epoch-zero/empty/invalid to never-landed (null)', () => {
    const rows = [
      { stream: 'a', latest: '1970-01-01 00:00:00.000' },
      { stream: 'b', latest: '' },
      { stream: 'c', latest: 'not a date' },
    ]
    expect(toSourceFreshness(rows, now).map((f) => f.lagMinutes)).toEqual([null, null, null])
  })
})
