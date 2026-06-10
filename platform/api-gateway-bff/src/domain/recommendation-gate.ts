/**
 * Lean recommendation gate — the ADR-0004 seam. Every recommendation surfaced to an operator
 * passes through this PURE module (no framework, no I/O) before display: kill switch →
 * confidence floor → evidence-staleness by risk (BRD §18/§21). The full guardrail engine
 * (agent-platform/guardrail, P4/P5) replaces the policy here; the seam and the decision-log
 * write stay where they are.
 */

export type RiskLevel = 'low' | 'medium' | 'high'
export type ApprovalLevel = 'auto' | 'admin' | 'owner'

export interface RecommendationCandidate {
  id: string
  type: string // e.g. ads.pause_campaign, lifecycle.send_recovery
  riskLevel: RiskLevel
  confidence: number // 0..1, from the producer of the recommendation
  reversible: boolean
  sources: string[] // evidence streams: orders | payments | ad_spend | shipments | …
}

/** Per-stream evidence freshness. lagMinutes=null means the stream has never landed for this brand. */
export interface SourceFreshness {
  stream: string
  lagMinutes: number | null
}

export interface GatePolicy {
  killSwitch: boolean
  confidenceFloor: number
  /** Evidence older than this withholds (high) or escalates + labels (medium/low) — BRD §21.1. */
  maxLagMinutesByRisk: Record<RiskLevel, number>
}

export const DEFAULT_GATE_POLICY: GatePolicy = {
  killSwitch: false,
  confidenceFloor: 0.6,
  maxLagMinutesByRisk: { high: 60, medium: 360, low: 1440 },
}

export interface GateVerdict {
  allowed: boolean
  approvalLevel: ApprovalLevel
  /** Machine-readable reasons for every failed/degraded check (empty = clean pass). */
  reasons: string[]
  /** Streams whose staleness degraded this verdict — the surface MUST label these. */
  staleSources: string[]
}

const ESCALATION: Record<ApprovalLevel, ApprovalLevel> = { auto: 'admin', admin: 'owner', owner: 'owner' }

function baseApprovalLevel(c: RecommendationCandidate): ApprovalLevel {
  if (c.riskLevel === 'high') return 'owner'
  if (c.riskLevel === 'medium') return 'admin'
  return c.reversible ? 'auto' : 'admin' // only low-risk AND reversible is auto-eligible (BRD §18)
}

export function gateRecommendation(
  candidate: RecommendationCandidate,
  freshness: SourceFreshness[],
  policy: GatePolicy = DEFAULT_GATE_POLICY,
): GateVerdict {
  const reasons: string[] = []

  if (policy.killSwitch) {
    return { allowed: false, approvalLevel: 'owner', reasons: ['kill_switch'], staleSources: [] }
  }

  if (candidate.confidence < policy.confidenceFloor) {
    reasons.push(`confidence_below_floor:${candidate.confidence}<${policy.confidenceFloor}`)
  }

  const maxLag = policy.maxLagMinutesByRisk[candidate.riskLevel]
  const byStream = new Map(freshness.map((f) => [f.stream, f.lagMinutes]))
  const staleSources = candidate.sources.filter((s) => {
    const lag = byStream.get(s)
    return lag === null || lag === undefined || lag > maxLag
  })
  if (staleSources.length > 0) reasons.push(`stale_evidence:${staleSources.join(',')}`)

  // BRD §21.1: stale evidence WITHHOLDS high-risk recommendations; lower-risk ones surface
  // escalated + labelled. A failed confidence floor withholds at any risk level.
  const withheld = reasons.some((r) => r.startsWith('confidence_below_floor')) || (candidate.riskLevel === 'high' && staleSources.length > 0)

  let approvalLevel = baseApprovalLevel(candidate)
  if (!withheld && staleSources.length > 0) approvalLevel = ESCALATION[approvalLevel]

  return { allowed: !withheld, approvalLevel, reasons, staleSources }
}

/** Map raw max-timestamp rows (ClickHouse) to SourceFreshness. Epoch-zero/empty = never landed. */
export function toSourceFreshness(rows: Array<{ stream: string; latest: string }>, now: Date): SourceFreshness[] {
  return rows.map(({ stream, latest }) => {
    // ClickHouse toString(DateTime64) emits 'YYYY-MM-DD HH:MM:SS[.mmm]' with NO timezone, in
    // server time (UTC). Date.parse would read that as LOCAL time — normalize to explicit UTC.
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(latest) ? `${latest.replace(' ', 'T')}Z` : latest
    const ts = Date.parse(normalized)
    const neverLanded = !latest || Number.isNaN(ts) || ts <= 0
    return { stream, lagMinutes: neverLanded ? null : Math.max(0, Math.round((now.getTime() - ts) / 60_000)) }
  })
}
