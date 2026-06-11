import { Injectable } from '@nestjs/common'
import { metricClientFromEnv } from '@brain/metric-client'
import { deriveTopActions, type TopActionCandidate } from '../domain/top-action-rules'
import type { GateVerdict } from '../domain/recommendation-gate'
import { FreshnessService } from './freshness.service'
import { RecommendationGateService } from './recommendation-gate.service'

export interface SurfacedAction {
  id: string
  type: string
  title: string
  why: string
  evidence: Record<string, number>
  approvalLevel: GateVerdict['approvalLevel']
  staleSources: string[]
}

export interface TopActionsResponse {
  actions: SurfacedAction[]
  withheld: number
  asOf: string
  source: 'metric-engine' | 'unavailable'
}

/**
 * The top-actions producer (BRD §11 Home: "the top three actions"): trusted figures →
 * deterministic rules → the ADR-0004 gate (kill switch / confidence / staleness, decision-log
 * write) → at most three surfaced actions. Without a metric engine there are NO actions —
 * recommendations are never produced from un-trusted numbers.
 */
@Injectable()
export class TopActionsService {
  private static readonly MAX_ACTIONS = 3

  constructor(
    private readonly freshness: FreshnessService,
    private readonly gate: RecommendationGateService,
  ) {}

  async forBrand(slug: string, brandId: string): Promise<TopActionsResponse> {
    const engine = metricClientFromEnv()
    if (!engine) return { actions: [], withheld: 0, asOf: new Date().toISOString(), source: 'unavailable' }
    const res = await engine.getMetrics(brandId)
    if (!res) return { actions: [], withheld: 0, asOf: new Date().toISOString(), source: 'unavailable' }

    const freshness = await this.freshness.forBrand(slug)
    const candidates = deriveTopActions(
      res.metrics.map((m) => ({ id: m.id, value: m.value, estimated: m.estimated })),
      freshness,
    )

    const verdicts = await this.gate.evaluate(slug, brandId, candidates)
    const surfaced: SurfacedAction[] = []
    let withheld = 0
    for (const { candidate, verdict } of verdicts) {
      if (!verdict.allowed) {
        withheld++
        continue
      }
      if (surfaced.length >= TopActionsService.MAX_ACTIONS) continue
      const c = candidate as TopActionCandidate
      surfaced.push({
        id: c.id,
        type: c.type,
        title: c.title,
        why: c.why,
        evidence: c.evidence,
        approvalLevel: verdict.approvalLevel,
        staleSources: verdict.staleSources,
      })
    }
    return { actions: surfaced, withheld, asOf: res.computed_at, source: 'metric-engine' }
  }
}
