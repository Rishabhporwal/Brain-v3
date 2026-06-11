import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Pool } from 'pg'
import { metricClientFromEnv } from '@brain/metric-client'
import { PG_POOL } from '../persistence/db.providers'
import { computeMonthlyFee, DEFAULT_TIERS, type FeeBreakdown, type TierName } from '../domain/fee'

export interface FeePreview extends FeeBreakdown {
  brand_id: string
  tier: TierName
  period: { from: string; to: string }
  realized_gmv_minor: number
  gmv_source: 'metric-engine' | 'unavailable'
}

/**
 * Billing floor (BRD §23): fee preview per brand per month. Consumes realized GMV from the
 * metric engine (invariant 1 — billing never computes its own numbers); the GMV-% component
 * therefore degrades explicitly when no engine is configured. Invoice issuance (provider
 * integration) is the next slice; this service is the fee-math system of record.
 */
@Injectable()
export class BillingService {
  constructor(@Inject(PG_POOL) private readonly pg: Pool) {}

  async preview(brandId: string, month: string): Promise<FeePreview> {
    const { from, to } = monthBounds(month)
    const brand = await this.brand(brandId)
    const tierName = brand.tier ?? 'launch'
    const tier = DEFAULT_TIERS[tierName]

    let gmv = 0
    let gmvSource: FeePreview['gmv_source'] = 'unavailable'
    const engine = metricClientFromEnv()
    if (engine) {
      const res = await engine.getMetrics(brandId, ['realized_revenue'], { from, to })
      const metric = res?.metrics.find((m) => m.id === 'realized_revenue')
      if (metric && !metric.estimated) {
        gmv = metric.value
        gmvSource = 'metric-engine'
      }
      // estimated revenue (pixel fallback) is NEVER a billing basis — stays 0/unavailable.
    }

    const breakdown = computeMonthlyFee({
      tier,
      realizedGmvMinor: gmv,
      cm2Minor: null, // CM2 arrives with the realized-revenue ledger; cap not applied until then
      activationEndsAt: brand.activationEndsAt,
      periodEnd: new Date(to),
    })

    return {
      brand_id: brandId,
      tier: tierName,
      period: { from, to },
      realized_gmv_minor: gmv,
      gmv_source: gmvSource,
      ...breakdown,
    }
  }

  private async brand(brandId: string): Promise<{ tier: TierName | null; activationEndsAt: Date }> {
    const { rows } = await this.pg.query<{ created_at: string; tier: TierName | null }>(
      `SELECT b.created_at, bt.tier
         FROM platform.brands b
         LEFT JOIN billing.brand_tier bt ON bt.brand_id = b.id
        WHERE b.id = $1`,
      [brandId],
    )
    if (!rows[0]) throw new NotFoundException('unknown brand')
    // Activation window = Day 0–14 from brand creation (aligned with onboarding, BRD §23.1),
    // unless an explicit override exists on the tier assignment.
    const activationEndsAt = new Date(new Date(rows[0].created_at).getTime() + 14 * 86_400_000)
    return { tier: rows[0].tier, activationEndsAt }
  }
}

export function monthBounds(month: string): { from: string; to: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new NotFoundException('month must be YYYY-MM')
  const [y, m] = month.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString()
  const to = new Date(Date.UTC(y, m, 1)).toISOString()
  return { from, to }
}
