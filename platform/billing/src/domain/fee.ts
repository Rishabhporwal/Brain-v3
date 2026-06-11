/**
 * PURE fee math for BRD §23 — no I/O, fully tested. Pricing principle: a percentage of
 * REALIZED GMV by tier, above a per-tier minimum monthly fee, capped by the CM2 affordability
 * guardrail (lower-of rule), with a Day-0–14 activation period before the first invoice.
 * Money is integer minor units in the brand currency; percentages are basis points.
 */

export type TierName = 'launch' | 'growth' | 'scale' | 'enterprise'

export interface TierConfig {
  tier: TierName
  gmv_bps: number // % of realized GMV in basis points (100 bps = 1%)
  min_fee_minor: number // monthly cost-to-serve floor
  cm2_cap_bps: number // fee may not exceed this share of CM2 (lower-of rule)
}

/** BRD §23.2 indicative packaging — overridable per brand via billing.brand_tier. */
export const DEFAULT_TIERS: Record<TierName, TierConfig> = {
  launch: { tier: 'launch', gmv_bps: 100, min_fee_minor: 1_500_000, cm2_cap_bps: 2000 }, // 1.0%, floor 15k major
  growth: { tier: 'growth', gmv_bps: 75, min_fee_minor: 5_000_000, cm2_cap_bps: 2000 }, // 0.75%
  scale: { tier: 'scale', gmv_bps: 50, min_fee_minor: 15_000_000, cm2_cap_bps: 2000 }, // 0.5%
  enterprise: { tier: 'enterprise', gmv_bps: 0, min_fee_minor: 0, cm2_cap_bps: 2000 }, // fixed contract — engine returns 0; invoicing is contractual
}

export interface FeeInput {
  tier: TierConfig
  realizedGmvMinor: number
  /** CM2 for the period when the metric engine can provide it; null = guardrail not applicable yet. */
  cm2Minor: number | null
  /** End of the brand's activation window (Day 0–14 onboarding); fee is waived before it. */
  activationEndsAt: Date
  periodEnd: Date
}

export type FeeBasis = 'activation_waived' | 'minimum_fee' | 'gmv_percent' | 'cm2_cap' | 'enterprise_contract'

export interface FeeBreakdown {
  fee_minor: number
  basis: FeeBasis
  gmv_component_minor: number
  cm2_cap_minor: number | null
  min_fee_minor: number
  notes: string[]
}

export function computeMonthlyFee(input: FeeInput): FeeBreakdown {
  const { tier } = input
  const notes: string[] = []

  if (input.periodEnd <= input.activationEndsAt) {
    return {
      fee_minor: 0,
      basis: 'activation_waived',
      gmv_component_minor: 0,
      cm2_cap_minor: null,
      min_fee_minor: tier.min_fee_minor,
      notes: [
        'activation period (Day 0–14): no GMV-based invoice before cost setup + data quality reach the accuracy bar (BRD §23.1)',
      ],
    }
  }

  if (tier.tier === 'enterprise') {
    return {
      fee_minor: 0,
      basis: 'enterprise_contract',
      gmv_component_minor: 0,
      cm2_cap_minor: null,
      min_fee_minor: 0,
      notes: ['enterprise: fixed annual contract — fee is contractual, not computed from GMV'],
    }
  }

  const gmvComponent = Math.round((input.realizedGmvMinor * tier.gmv_bps) / 10_000)
  let fee = Math.max(gmvComponent, tier.min_fee_minor)
  let basis: FeeBasis = gmvComponent > tier.min_fee_minor ? 'gmv_percent' : 'minimum_fee'

  // CM2 affordability guardrail (lower-of rule): the fee never consumes a disproportionate share
  // of profit. Only applicable above the floor and when CM2 is actually known.
  let cm2Cap: number | null = null
  if (input.cm2Minor !== null && input.cm2Minor >= 0) {
    cm2Cap = Math.round((input.cm2Minor * tier.cm2_cap_bps) / 10_000)
    if (basis === 'gmv_percent' && cm2Cap < fee) {
      fee = Math.max(cm2Cap, tier.min_fee_minor)
      basis = fee === tier.min_fee_minor ? 'minimum_fee' : 'cm2_cap'
      notes.push(`cm2 affordability cap applied: lower-of(gmv ${tier.gmv_bps}bps, ${tier.cm2_cap_bps}bps of CM2)`)
    }
  } else {
    notes.push('cm2 unknown (realized-revenue ledger pending): affordability cap not applied')
  }

  return {
    fee_minor: fee,
    basis,
    gmv_component_minor: gmvComponent,
    cm2_cap_minor: cm2Cap,
    min_fee_minor: tier.min_fee_minor,
    notes,
  }
}
