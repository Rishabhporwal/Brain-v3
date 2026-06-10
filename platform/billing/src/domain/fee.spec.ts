import { describe, expect, it } from 'vitest'
import { computeMonthlyFee, DEFAULT_TIERS, type FeeInput } from './fee'

const base: FeeInput = {
  tier: DEFAULT_TIERS.launch, // 1.0% GMV, floor 1_500_000, cap 20% of CM2
  realizedGmvMinor: 1_000_000_000, // 10M major → 1% = 100k major = 10_000_000 minor
  cm2Minor: 200_000_000,
  activationEndsAt: new Date('2026-06-01T00:00:00Z'),
  periodEnd: new Date('2026-06-30T23:59:59Z'),
}

describe('computeMonthlyFee (BRD §23)', () => {
  it('charges the GMV percentage when it exceeds the floor', () => {
    const f = computeMonthlyFee(base)
    expect(f).toMatchObject({ fee_minor: 10_000_000, basis: 'gmv_percent', gmv_component_minor: 10_000_000 })
  })

  it('falls back to the minimum monthly fee for low GMV', () => {
    const f = computeMonthlyFee({ ...base, realizedGmvMinor: 50_000_000 }) // 1% = 500_000 < floor
    expect(f).toMatchObject({ fee_minor: 1_500_000, basis: 'minimum_fee' })
  })

  it('applies the CM2 affordability cap (lower-of rule) for thin-margin brands', () => {
    // cap = 20% of 30_000_000 = 6_000_000 < gmv component 10_000_000
    const f = computeMonthlyFee({ ...base, cm2Minor: 30_000_000 })
    expect(f).toMatchObject({ fee_minor: 6_000_000, basis: 'cm2_cap', cm2_cap_minor: 6_000_000 })
  })

  it('the CM2 cap never undercuts the minimum fee floor', () => {
    // cap = 20% of 1_000_000 = 200_000 < floor 1_500_000 → floor wins
    const f = computeMonthlyFee({ ...base, cm2Minor: 1_000_000 })
    expect(f).toMatchObject({ fee_minor: 1_500_000, basis: 'minimum_fee' })
  })

  it('skips the cap with an explanatory note when CM2 is unknown (ledger pending)', () => {
    const f = computeMonthlyFee({ ...base, cm2Minor: null })
    expect(f.basis).toBe('gmv_percent')
    expect(f.cm2_cap_minor).toBeNull()
    expect(f.notes.join(' ')).toContain('cm2 unknown')
  })

  it('waives everything during the Day-0–14 activation period', () => {
    const f = computeMonthlyFee({ ...base, activationEndsAt: new Date('2026-07-15T00:00:00Z') })
    expect(f).toMatchObject({ fee_minor: 0, basis: 'activation_waived' })
  })

  it('enterprise is contractual — engine computes no GMV fee', () => {
    const f = computeMonthlyFee({ ...base, tier: DEFAULT_TIERS.enterprise })
    expect(f).toMatchObject({ fee_minor: 0, basis: 'enterprise_contract' })
  })

  it('tier percentages match the BRD §23.2 indicative packaging', () => {
    expect(DEFAULT_TIERS.launch.gmv_bps).toBe(100) // ~1.0%
    expect(DEFAULT_TIERS.growth.gmv_bps).toBe(75) // ~0.75%
    expect(DEFAULT_TIERS.scale.gmv_bps).toBe(50) // ~0.5%
  })
})
