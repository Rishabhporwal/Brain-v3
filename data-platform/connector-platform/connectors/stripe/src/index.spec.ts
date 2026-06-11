import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { mapStripeWebhook, verifyStripeWebhook } from './index'

const SECRET = 'whsec_test_secret'

function sign(body: string, ts: number): string {
  const v1 = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')
  return `t=${ts},v1=${v1}`
}

describe('stripe verifyWebhook', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' })
  const now = 1_750_000_000

  it('accepts a valid signature within tolerance', () => {
    expect(verifyStripeWebhook(Buffer.from(body), sign(body, now - 10), SECRET, now)).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifyStripeWebhook(Buffer.from(body + ' '), sign(body, now), SECRET, now)).toBe(false)
  })

  it('rejects a stale timestamp (replay)', () => {
    expect(verifyStripeWebhook(Buffer.from(body), sign(body, now - 3600), SECRET, now)).toBe(false)
  })

  it('rejects a missing or malformed header', () => {
    expect(verifyStripeWebhook(Buffer.from(body), undefined, SECRET, now)).toBe(false)
    expect(verifyStripeWebhook(Buffer.from(body), 't=,v1=', SECRET, now)).toBe(false)
  })
})

describe('stripe mapWebhook', () => {
  it('maps payment_intent.succeeded to a canonical PaymentRecord', () => {
    const event = {
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_3Abc',
          object: 'payment_intent',
          amount: 149900,
          currency: 'inr',
          status: 'succeeded',
          payment_method_types: ['card'],
          created: 1_750_000_000,
          metadata: { order_id: 'order_1001' },
        },
      },
    }
    const mapped = mapStripeWebhook({ rawBody: Buffer.from(JSON.stringify(event)), headers: {} })
    expect(mapped.topic).toBe('payment_intent.succeeded')
    expect(mapped.records).toEqual([
      {
        stream: 'payments',
        data: {
          payment_id: 'pi_3Abc',
          order_ref: 'order_1001',
          amount_minor: '149900',
          currency: 'INR',
          status: 'succeeded',
          method: 'card',
          created_at: new Date(1_750_000_000 * 1000).toISOString(),
        },
      },
    ])
  })

  it('maps charge.refunded with the refunded amount and status', () => {
    const event = {
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_9',
          amount: 149900,
          amount_refunded: 50000,
          currency: 'inr',
          status: 'succeeded',
          created: 1_750_000_100,
        },
      },
    }
    const mapped = mapStripeWebhook({ rawBody: Buffer.from(JSON.stringify(event)), headers: {} })
    const rec = mapped.records[0]?.data as { amount_minor: string; status: string }
    expect(rec.amount_minor).toBe('50000')
    expect(rec.status).toBe('refunded')
  })

  it('emits no records for non-payment events and survives bad JSON', () => {
    expect(
      mapStripeWebhook({
        rawBody: Buffer.from(JSON.stringify({ type: 'customer.created', data: { object: { id: 'cus_1' } } })),
        headers: {},
      }).records,
    ).toEqual([])
    expect(mapStripeWebhook({ rawBody: Buffer.from('{not json'), headers: {} }).records).toEqual([])
  })
})
