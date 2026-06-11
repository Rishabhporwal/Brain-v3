import type { RecommendationCandidate } from './recommendation-gate'
import type { SourceFreshness } from './recommendation-gate'

/**
 * PURE deterministic top-action rules (the lean producer behind BRD §11 "top three actions").
 * Effort-tier honesty: these are cheap deterministic conditions over TRUSTED metric-engine
 * figures — no model call, no fabricated impact numbers. Each candidate carries its evidence
 * (the metric values that triggered it); ranking is by severity then confidence. Every candidate
 * still passes the recommendation gate (kill switch / confidence / staleness) before display.
 */

export interface MetricInput {
  id: string
  value: number
  estimated: boolean
}

export interface TopActionCandidate extends RecommendationCandidate {
  title: string
  why: string
  evidence: Record<string, number>
  severity: number // 1 (info) … 3 (urgent) — ranking key before confidence
}

export const THRESHOLDS = {
  rtoRatePct: 15, // above this, COD leakage is eating margin
  merFloor: 2, // below 2× blended return, spend efficiency needs review
  conversionRateFloorPct: 1, // below this with real traffic, the funnel leaks
  minSessionsForFunnel: 200, // don't judge a funnel without traffic
  staleSourceLagMinutes: 24 * 60, // a day-stale source is an integration problem, not noise
} as const

export function deriveTopActions(metrics: MetricInput[], freshness: SourceFreshness[]): TopActionCandidate[] {
  const m = new Map(metrics.map((x) => [x.id, x]))
  const out: TopActionCandidate[] = []

  const rto = m.get('rto_rate')
  if (rto && rto.value > THRESHOLDS.rtoRatePct) {
    out.push({
      id: 'rto-review-courier',
      type: 'logistics.review_courier_rules',
      title: 'RTO rate is eating margin — review courier/pincode rules',
      why: `RTO rate is ${rto.value}% (threshold ${THRESHOLDS.rtoRatePct}%). Every RTO is paid shipping + handling with zero realized revenue.`,
      evidence: { rto_rate: rto.value },
      severity: 3,
      riskLevel: 'medium',
      confidence: 0.9,
      reversible: true,
      sources: ['shipments'],
    })
  }

  const mer = m.get('mer')
  const spend = m.get('spend')
  if (mer && spend && spend.value > 0 && mer.value < THRESHOLDS.merFloor) {
    out.push({
      id: 'mer-review-budget',
      type: 'ads.review_budget_allocation',
      title: 'Blended MER is below floor — review budget allocation',
      why: `MER is ${mer.value}× (floor ${THRESHOLDS.merFloor}×): every ad rupee returns less than the efficiency floor.`,
      evidence: { mer: mer.value, spend: spend.value },
      severity: 2,
      riskLevel: 'medium',
      confidence: 0.85,
      reversible: true,
      sources: ['ad_spend', 'orders'],
    })
  }

  const cr = m.get('conversion_rate')
  const sessions = m.get('sessions')
  if (
    cr &&
    sessions &&
    sessions.value >= THRESHOLDS.minSessionsForFunnel &&
    cr.value < THRESHOLDS.conversionRateFloorPct
  ) {
    out.push({
      id: 'funnel-review-checkout',
      type: 'web.review_checkout_funnel',
      title: 'Conversion rate is below 1% with real traffic — review the funnel',
      why: `${sessions.value} sessions converted at ${cr.value}% — the leak is on-site, not in acquisition.`,
      evidence: { conversion_rate: cr.value, sessions: sessions.value },
      severity: 2,
      riskLevel: 'low',
      confidence: 0.75,
      reversible: true,
      sources: ['orders'],
    })
  }

  for (const f of freshness) {
    if (f.lagMinutes !== null && f.lagMinutes > THRESHOLDS.staleSourceLagMinutes) {
      out.push({
        id: `stale-${f.stream}`,
        type: 'integrations.fix_connection',
        title: `${f.stream} data is ${Math.round(f.lagMinutes / 60)}h stale — check the integration`,
        why: 'Stale evidence degrades every downstream number and withholds high-risk recommendations.',
        evidence: { lag_minutes: f.lagMinutes },
        severity: 1,
        riskLevel: 'low',
        confidence: 0.95,
        reversible: true,
        sources: [], // the action is ABOUT the stale source; gating it on that source would self-block
      })
    }
  }

  return out.sort((a, b) => b.severity - a.severity || b.confidence - a.confidence)
}
