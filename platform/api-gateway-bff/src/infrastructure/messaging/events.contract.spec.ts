import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Ajv2020 } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { buildDomainEnvelope, buildPullEnvelope, buildWebhookEnvelope } from './events'

/**
 * Contract test: the envelopes this producer emits MUST validate against the canonical
 * JSON Schemas in /contracts/events/schemas. A producer-shape change without a schema
 * change (or vice versa) fails here — this is the contract gate until the schema
 * registry enforces compatibility on the wire.
 */
const SCHEMA_DIR = join(__dirname, '..', '..', '..', '..', '..', 'contracts', 'events', 'schemas')

// strictRequired off: the ad-spend schema's anyOf declares provider-variant required fields
// (cost_micros | spend) without re-declaring properties in each branch — valid 2020-12, ajv-strict noise.
// allowUnionTypes: provider APIs return numerics as string OR number (GAQL int64-as-string vs JSON numbers).
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true })
addFormats(ajv)
for (const f of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json'))) {
  ajv.addSchema(JSON.parse(readFileSync(join(SCHEMA_DIR, f), 'utf8')))
}

function assertValid(schemaId: string, data: object): void {
  const validate = ajv.getSchema(schemaId)
  if (!validate) throw new Error(`schema not registered: ${schemaId}`)
  const ok = validate(data)
  expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true)
}

const NOW = '2026-06-11T10:00:00.000Z'
const BRAND = '0197604e-32a5-7000-8000-000000000000'

describe('event envelope ↔ contracts/events schema parity', () => {
  it('control-plane DomainEvent envelope matches integration.event.v1', () => {
    assertValid(
      'brain://events/integration.event.v1',
      buildDomainEnvelope({ type: 'integration.connected', brandId: BRAND, actor: 'system', payload: { provider: 'shopify' } }, NOW),
    )
    // platform-scoped event (null brand) is legal
    assertValid('brain://events/integration.event.v1', buildDomainEnvelope({ type: 'integration.disconnected', brandId: null, actor: 'system' }, NOW))
  })

  it('webhook envelope with canonical OrderRecord matches integration.webhook.v1', () => {
    assertValid(
      'brain://events/integration.webhook.v1',
      buildWebhookEnvelope(
        {
          provider: 'shopify',
          topic: 'orders/create',
          stream: 'orders',
          brandId: BRAND,
          shop: 'demo.myshopify.com',
          payload: {
            order_id: '5678901234',
            order_name: '#1001',
            total_price: '1499.00',
            currency: 'INR',
            financial_status: 'paid',
            fulfillment_status: 'unfulfilled',
            customer_id: '987654',
            ordered_at: '2026-06-11T09:58:00Z',
          },
        },
        NOW,
      ),
    )
  })

  it('webhook envelope with canonical PaymentRecord matches integration.webhook.v1', () => {
    assertValid(
      'brain://events/integration.webhook.v1',
      buildWebhookEnvelope(
        {
          provider: 'razorpay',
          topic: 'payment.captured',
          stream: 'payments',
          brandId: BRAND,
          payload: {
            payment_id: 'pay_NXk2',
            order_ref: 'order_NXk1',
            amount_minor: '149900',
            currency: 'INR',
            status: 'captured',
            method: 'upi',
            created_at: '2026-06-11T09:59:00Z',
          },
        },
        NOW,
      ),
    )
  })

  it('rejects an orders webhook whose payload misses the MV-required keys', () => {
    const validate = ajv.getSchema('brain://events/integration.webhook.v1')!
    const bad = buildWebhookEnvelope(
      { provider: 'shopify', topic: 'orders/create', stream: 'orders', brandId: BRAND, payload: { order_name: '#1001' } },
      NOW,
    )
    expect(validate(bad)).toBe(false)
  })

  it('pull envelope with google ad-spend record matches integration.pull.v1', () => {
    assertValid(
      'brain://events/integration.pull.v1',
      buildPullEnvelope(
        { provider: 'google', brandId: BRAND, stream: 'ad_spend', records: [] },
        {
          primaryKey: '222333:2026-06-10',
          data: { date: '2026-06-10', campaign_id: '222333', campaign_name: 'Brand-IN', spend_minor: '1234', cost_micros: '12340000', clicks: '57', conversions: '3.0', currency: 'INR' },
        },
        NOW,
      ),
    )
  })

  it('pull envelope with meta ad-spend record matches integration.pull.v1', () => {
    assertValid(
      'brain://events/integration.pull.v1',
      buildPullEnvelope(
        { provider: 'meta', brandId: BRAND, stream: 'ad_spend', records: [] },
        {
          primaryKey: '120208:2026-06-10',
          data: { date: '2026-06-10', campaign_id: '120208', campaign_name: 'Prospecting', spend_minor: '84567', spend: '845.67', impressions: '10233', clicks: '188', currency: 'INR' },
        },
        NOW,
      ),
    )
  })

  it('rejects an ad-spend record with neither cost_micros nor spend', () => {
    const validate = ajv.getSchema('brain://events/integration.pull.v1')!
    const bad = buildPullEnvelope(
      { provider: 'google', brandId: BRAND, stream: 'ad_spend', records: [] },
      { data: { date: '2026-06-10', campaign_id: '1', currency: 'INR' } },
      NOW,
    )
    expect(validate(bad)).toBe(false)
  })
})
