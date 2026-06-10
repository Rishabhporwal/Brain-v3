import { describe, expect, it } from 'vitest'
import { FORMULAS, type RawAggregates } from './formulas'
import { loadRegistry } from './registry'

const raw = (over: Partial<RawAggregates> = {}): RawAggregates => ({
  ordersRealized: { orders: 10, revenueMinor: 1_499_000 },
  pixelPurchases: { orders: 3, revenueMinor: 450_000 },
  pixel: { sessions: 200, conversions: 12 },
  adSpendMinor: 300_000,
  factSpendMinor: 0,
  paymentsCapturedMinor: 1_200_000,
  shipments: { total: 20, rto: 3 },
  ...over,
})

describe('formula book parity (the CI gate)', () => {
  const registry = loadRegistry()

  it('every implemented formula is registered with a matching version', () => {
    for (const [id, f] of Object.entries(FORMULAS)) {
      const def = registry.get(id)
      expect(def, `'${id}' missing from contracts/metrics/registry.yaml`).toBeDefined()
      expect(def!.formula_version, `'${id}' version drift`).toBe(f.formula_version)
    }
  })

  it('every registered metric is implemented (no vaporware in the book)', () => {
    for (const id of registry.keys()) expect(FORMULAS[id], `'${id}' registered but not implemented`).toBeDefined()
  })
})

describe('formulas', () => {
  it('realized_revenue prefers order facts and is not estimated', () => {
    expect(FORMULAS.realized_revenue.compute(raw())).toEqual({ value: 1_499_000, estimated: false })
  })

  it('falls back to pixel purchases and marks the value ESTIMATED', () => {
    const r = raw({ ordersRealized: { orders: 0, revenueMinor: 0 } })
    expect(FORMULAS.realized_revenue.compute(r)).toEqual({ value: 450_000, estimated: true })
    expect(FORMULAS.orders.compute(r)).toEqual({ value: 3, estimated: true })
  })

  it('returns null (never zero, never fabricated) when no evidence exists', () => {
    const empty = raw({
      ordersRealized: { orders: 0, revenueMinor: 0 },
      pixelPurchases: { orders: 0, revenueMinor: 0 },
      pixel: { sessions: 0, conversions: 0 },
      adSpendMinor: 0,
      factSpendMinor: 0,
      paymentsCapturedMinor: 0,
      shipments: { total: 0, rto: 0 },
    })
    for (const f of Object.values(FORMULAS)) expect(f.compute(empty)).toBeNull()
  })

  it('aov = revenue/orders in integer minor units', () => {
    expect(FORMULAS.aov.compute(raw())).toEqual({ value: 149_900, estimated: false })
  })

  it('mer/roas = revenue/spend (2dp); estimated propagates from the revenue fallback', () => {
    expect(FORMULAS.mer.compute(raw())).toEqual({ value: 5, estimated: false })
    expect(FORMULAS.roas.compute(raw())).toEqual(FORMULAS.mer.compute(raw()))
    const est = raw({ ordersRealized: { orders: 0, revenueMinor: 0 } })
    expect(FORMULAS.mer.compute(est)).toEqual({ value: 1.5, estimated: true })
  })

  it('spend falls back to fact_spend without estimation (both are normalized facts)', () => {
    expect(FORMULAS.spend.compute(raw({ adSpendMinor: 0, factSpendMinor: 250_000 }))).toEqual({ value: 250_000, estimated: false })
  })

  it('conversion_rate (1dp) and rto_rate (1dp)', () => {
    expect(FORMULAS.conversion_rate.compute(raw())).toEqual({ value: 6, estimated: false })
    expect(FORMULAS.rto_rate.compute(raw())).toEqual({ value: 15, estimated: false })
  })
})
