import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  type ConnectorHooks,
  type ConnectorManifest,
  type PaymentRecord,
  type WebhookContext,
  type WebhookMapped,
} from '@brain/connector-kit'

/**
 * Stripe connector (push lane, payments). Webhooks carry a `Stripe-Signature` header of the form
 * `t=<unix>,v1=<hex hmac>[,v1=…]`; the HMAC-SHA256 is computed over `${t}.${rawBody}` with the endpoint's
 * signing secret (whsec_…), NOT over the body alone — hence the custom verify instead of kit verifyHmac.
 * Stripe amounts are already integer minor units. Webhooks are account-level (no brand in the body) → the
 * receiver resolves the brand from the URL path, same as Razorpay.
 */
export const STRIPE_MANIFEST: ConnectorManifest = {
  provider: 'stripe',
  category: 'payments',
  tier: 2,
  auth: 'apikey',
  ingest: ['push'],
  streams: [{ name: 'payments', mode: 'push', primaryKey: 'payment_id' }],
  backfill: 'paginated',
}

/** Default tolerance for the signed timestamp (replay window), mirroring stripe-node. */
const SIGNATURE_TOLERANCE_SECONDS = 300

interface StripeEntity {
  id?: string
  object?: string // payment_intent | charge | refund
  amount?: number // integer minor units
  amount_refunded?: number
  currency?: string // lowercase ISO4217
  status?: string
  payment_method_types?: string[]
  payment_method_details?: { type?: string }
  created?: number // unix seconds
  metadata?: { order_id?: string }
}

function normalizePayment(e: StripeEntity, eventType: string): PaymentRecord {
  const refunded = eventType === 'charge.refunded'
  return {
    payment_id: e.id ?? '',
    order_ref: e.metadata?.order_id ?? '',
    amount_minor: String(refunded ? (e.amount_refunded ?? 0) : (e.amount ?? 0)), // already minor units
    currency: (e.currency ?? '').toUpperCase(),
    status: refunded ? 'refunded' : (e.status ?? ''),
    method: e.payment_method_types?.[0] ?? e.payment_method_details?.type ?? '',
    created_at: e.created ? new Date(e.created * 1000).toISOString() : '',
  }
}

/** Verify `Stripe-Signature: t=<ts>,v1=<sig>` — HMAC-SHA256 hex over `${ts}.${rawBody}`, bounded replay window. */
export function verifyStripeWebhook(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false
  const parts = new Map<string, string[]>()
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=', 2).map((s) => s?.trim())
    if (!k || !v) continue
    parts.set(k, [...(parts.get(k) ?? []), v])
  }
  const ts = parts.get('t')?.[0]
  const sigs = parts.get('v1') ?? []
  if (!ts || sigs.length === 0) return false
  if (Math.abs(nowSeconds - Number(ts)) > SIGNATURE_TOLERANCE_SECONDS) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(`${ts}.`).update(rawBody).digest('hex'))
  return sigs.some((s) => {
    const candidate = Buffer.from(s)
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  })
}

export function mapStripeWebhook(ctx: WebhookContext): WebhookMapped {
  let body: { id?: string; type?: string; data?: { object?: StripeEntity } } = {}
  try {
    body = ctx.rawBody.length ? JSON.parse(ctx.rawBody.toString('utf8')) : {}
  } catch {
    body = {}
  }
  const eventType = body.type ?? '' // e.g. payment_intent.succeeded, charge.refunded
  const entity = body.data?.object
  const isPaymentEvent =
    eventType.startsWith('payment_intent.') || eventType === 'charge.refunded' || eventType.startsWith('charge.')
  const records = entity && isPaymentEvent ? [{ stream: 'payments', data: normalizePayment(entity, eventType) }] : []
  return { topic: eventType, records }
}

export const stripe: ConnectorHooks = {
  manifest: STRIPE_MANIFEST,
  // No dedup header: Stripe's event id lives in the body (evt_…), not a header; the signature header
  // changes per delivery attempt. Body-id dedup arrives with the kit's body-key support.
  verifyWebhook: (ctx, secret) => verifyStripeWebhook(ctx.rawBody, ctx.headers['stripe-signature'], secret),
  mapWebhook: mapStripeWebhook,
}
