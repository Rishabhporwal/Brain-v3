import {
  type ConnectorHooks,
  type ConnectorManifest,
  type PaymentRecord,
  type WebhookContext,
  type WebhookMapped,
  verifyHmac,
} from '@brain/connector-kit'

/**
 * Razorpay connector (push lane, payments). Webhooks carry X-Razorpay-Signature (hex HMAC-SHA256 of the
 * raw body with the webhook secret). Razorpay amounts are already in minor units (paise). Webhooks are
 * account-level (no brand in the body) → the receiver resolves the brand from the URL path.
 */
export const RAZORPAY_MANIFEST: ConnectorManifest = {
  provider: 'razorpay',
  category: 'payments',
  tier: 2,
  auth: 'apikey',
  ingest: ['push'],
  streams: [{ name: 'payments', mode: 'push', primaryKey: 'payment_id' }],
  backfill: 'paginated',
}

export const RAZORPAY_EVENT_ID_HEADER = 'x-razorpay-event-id'

interface RzpEntity {
  id?: string
  order_id?: string
  amount?: number
  currency?: string
  status?: string
  method?: string
  created_at?: number // unix seconds
}

function normalizePayment(e: RzpEntity): PaymentRecord {
  return {
    payment_id: e.id ?? '',
    order_ref: e.order_id ?? '',
    amount_minor: e.amount != null ? String(e.amount) : '0', // already minor units (paise)
    currency: e.currency ?? '',
    status: e.status ?? '',
    method: e.method ?? '',
    created_at: e.created_at ? new Date(e.created_at * 1000).toISOString() : '',
  }
}

export function verifyRazorpayWebhook(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  return verifyHmac(rawBody, signature, secret, 'hex')
}

export function mapRazorpayWebhook(ctx: WebhookContext): WebhookMapped {
  let body: { event?: string; payload?: { payment?: { entity?: RzpEntity }; refund?: { entity?: RzpEntity } } } = {}
  try {
    body = ctx.rawBody.length ? JSON.parse(ctx.rawBody.toString('utf8')) : {}
  } catch {
    body = {}
  }
  const event = body.event ?? '' // e.g. payment.captured, refund.created
  const entity = body.payload?.payment?.entity ?? body.payload?.refund?.entity
  const records = entity ? [{ stream: 'payments', data: normalizePayment(entity) }] : []
  return { topic: event, records }
}

export const razorpay: ConnectorHooks = {
  manifest: RAZORPAY_MANIFEST,
  webhookIdHeader: RAZORPAY_EVENT_ID_HEADER,
  verifyWebhook: (ctx, secret) => verifyRazorpayWebhook(ctx.rawBody, ctx.headers['x-razorpay-signature'], secret),
  mapWebhook: mapRazorpayWebhook,
}
