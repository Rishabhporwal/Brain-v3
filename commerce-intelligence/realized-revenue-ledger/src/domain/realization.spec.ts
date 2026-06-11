import { describe, expect, it } from 'vitest'
import { deriveLedgerEntry, type OrderFacts } from './realization'

const facts = (over: Partial<OrderFacts>): OrderFacts => ({
  orderId: 'o-1',
  revenueMinor: 149_900,
  financialStatus: 'paid',
  shipmentStatus: null,
  refundedMinor: 0,
  ...over,
})

describe('deriveLedgerEntry (realized over placed — BRD §3.5)', () => {
  it('a paid but undelivered order is PLACED, not realized', () => {
    expect(deriveLedgerEntry(facts({}))).toEqual({ state: 'placed', realized: false, realizedRevenueMinor: 0 })
  })

  it('delivered realizes the full amount', () => {
    expect(deriveLedgerEntry(facts({ shipmentStatus: 'delivered' }))).toEqual({
      state: 'delivered',
      realized: true,
      realizedRevenueMinor: 149_900,
    })
  })

  it('delivered with a partial refund realizes the net', () => {
    expect(deriveLedgerEntry(facts({ shipmentStatus: 'delivered', refundedMinor: 50_000 }))).toEqual({
      state: 'delivered',
      realized: true,
      realizedRevenueMinor: 99_900,
    })
  })

  it('RTO kills realization even when the order was paid (the COD killer)', () => {
    expect(deriveLedgerEntry(facts({ shipmentStatus: 'rto' })).realized).toBe(false)
    expect(deriveLedgerEntry(facts({ shipmentStatus: 'rto_delivered' })).state).toBe('rto')
  })

  it('cancellation/void ends the revenue life regardless of shipping', () => {
    expect(deriveLedgerEntry(facts({ financialStatus: 'voided', shipmentStatus: 'delivered' })).state).toBe('cancelled')
  })

  it('a full refund on the payment rail wins even if the order status lags', () => {
    expect(deriveLedgerEntry(facts({ refundedMinor: 149_900, shipmentStatus: 'delivered' })).state).toBe('refunded')
  })

  it('provider refunded status maps to refunded', () => {
    expect(deriveLedgerEntry(facts({ financialStatus: 'refunded' })).state).toBe('refunded')
  })

  it('lost shipments are not realized', () => {
    expect(deriveLedgerEntry(facts({ shipmentStatus: 'lost' })).realized).toBe(false)
  })
})
