import { Inject, Injectable } from '@nestjs/common'
import { Pool } from 'pg'
import { PG_POOL } from '../persistence/db.providers'
import { FreshnessService } from './freshness.service'
import {
  DEFAULT_GATE_POLICY,
  gateRecommendation,
  type GatePolicy,
  type GateVerdict,
  type RecommendationCandidate,
} from '../domain/recommendation-gate'

/**
 * The application seam every "top action" passes through before display (ADR-0004): fetch
 * evidence freshness → apply the pure gate → append the decision to platform.audit_logs
 * (the lean decision-log write — recommendation.surfaced / recommendation.withheld, with
 * the candidate, verdict, and freshness snapshot as evidence). The top-actions producer
 * (read-model builder, P2+) calls `evaluate`; nothing reaches an operator un-gated.
 */
@Injectable()
export class RecommendationGateService {
  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    private readonly freshness: FreshnessService,
  ) {}

  private policy(): GatePolicy {
    return {
      ...DEFAULT_GATE_POLICY,
      // Lean kill switch: env-driven until brand-config governance lands (then per-brand, 60s).
      killSwitch: (process.env.RECOMMENDATIONS_KILL_SWITCH ?? '').toLowerCase() === 'true',
      confidenceFloor: Number(process.env.RECOMMENDATION_CONFIDENCE_FLOOR ?? DEFAULT_GATE_POLICY.confidenceFloor),
    }
  }

  async evaluate(
    slug: string,
    brandId: string,
    candidates: RecommendationCandidate[],
  ): Promise<Array<{ candidate: RecommendationCandidate; verdict: GateVerdict }>> {
    const freshness = await this.freshness.forBrand(slug)
    const policy = this.policy()
    const results = candidates.map((candidate) => ({
      candidate,
      verdict: gateRecommendation(candidate, freshness, policy),
    }))
    for (const { candidate, verdict } of results) {
      await this.pg.query(
        `INSERT INTO platform.audit_logs(brand_id, actor_type, actor_id, action, after)
         VALUES ($1,'system_guardrail','recommendation-gate',$2,$3)`,
        [
          brandId,
          verdict.allowed ? 'recommendation.surfaced' : 'recommendation.withheld',
          JSON.stringify({ candidate, verdict, freshness }),
        ],
      )
    }
    return results
  }
}
