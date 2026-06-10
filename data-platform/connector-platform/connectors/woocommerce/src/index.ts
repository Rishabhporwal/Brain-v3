import {
  type ConnectorHooks,
  type ConnectorManifest,
  type OrderRecord,
  type WebhookContext,
  type WebhookMapped,
  verifyHmac,
} from '@brain/connector-kit'

/**
 * WooCommerce connector (push lane). Webhooks carry X-WC-Webhook-Signature (base64 HMAC-SHA256 of the raw
 * body with the per-webhook secret) and X-WC-Webhook-Topic (e.g. order.created). Orders normalize to the
 * SAME canonical OrderRecord as Shopify → one vendor-agnostic brain.orders.
 */
export const WOOCOMMERCE_MANIFEST: ConnectorManifest = {
  provider: 'woocommerce',
  category: 'storefront',
  tier: 1,
  auth: 'basic', // WooCommerce REST consumer key/secret
  ingest: ['push'],
  streams: [
    { name: 'orders', mode: 'push', primaryKey: 'id' },
    { name: 'products', mode: 'push', primaryKey: 'id' },
    { name: 'customers', mode: 'push', primaryKey: 'id' },
  ],
  backfill: 'paginated',
}

export const WC_WEBHOOK_ID_HEADER = 'x-wc-webhook-delivery-id'

interface WcOrder {
  id?: number | string
  number?: string
  total?: string
  currency?: string
  status?: string
  date_created_gmt?: string
  date_created?: string
  customer_id?: number | string
}

// WC order status → canonical financial_status.
const FINANCIAL: Record<string, string> = {
  completed: 'paid',
  processing: 'paid',
  refunded: 'refunded',
  pending: 'pending',
  'on-hold': 'pending',
  cancelled: 'cancelled',
  failed: 'failed',
}

function normalizeOrder(o: WcOrder): OrderRecord {
  const status = (o.status ?? '').toLowerCase()
  return {
    order_id: o.id != null ? String(o.id) : '',
    order_name: o.number ? `#${o.number}` : o.id != null ? `#${o.id}` : '',
    total_price: o.total ?? '0',
    currency: o.currency ?? '',
    financial_status: FINANCIAL[status] ?? status,
    fulfillment_status: status === 'completed' ? 'fulfilled' : '',
    customer_id: o.customer_id != null ? String(o.customer_id) : '',
    ordered_at: o.date_created_gmt ? `${o.date_created_gmt}Z` : (o.date_created ?? ''),
  }
}

/** Verify a WooCommerce webhook (base64 HMAC over the raw body, the webhook secret). */
export function verifyWoocommerceWebhook(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  return verifyHmac(rawBody, signature, secret, 'base64')
}

const STREAM_BY_TOPIC_PREFIX: Record<string, string> = { order: 'orders', product: 'products', customer: 'customers' }

export function mapWoocommerceWebhook(ctx: WebhookContext): WebhookMapped {
  const topic = ctx.headers['x-wc-webhook-topic'] ?? '' // e.g. order.created
  const source = (ctx.headers['x-wc-webhook-source'] ?? '').replace(/\/+$/, '')
  let payload: Record<string, unknown> = {}
  try {
    payload = ctx.rawBody.length ? (JSON.parse(ctx.rawBody.toString('utf8')) as Record<string, unknown>) : {}
  } catch {
    payload = {}
  }
  const stream = STREAM_BY_TOPIC_PREFIX[topic.split('.')[0]] ?? topic
  const data = stream === 'orders' ? normalizeOrder(payload as WcOrder) : payload
  return { topic, shop: source, records: [{ stream, data }] }
}

export const woocommerce: ConnectorHooks = {
  manifest: WOOCOMMERCE_MANIFEST,
  webhookIdHeader: WC_WEBHOOK_ID_HEADER,
  verifyWebhook: (ctx, secret) => verifyWoocommerceWebhook(ctx.rawBody, ctx.headers['x-wc-webhook-signature'], secret),
  mapWebhook: mapWoocommerceWebhook,
}
