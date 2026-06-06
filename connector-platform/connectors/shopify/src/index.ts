import { type ConnectorManifest, type WebhookContext, type WebhookMapped, verifyHmac } from '@brain/connector-kit'

/**
 * Shopify connector (push lane). Declares its manifest + webhook specifics; composes @brain/connector-kit
 * for the generic engine (HMAC verify, dedup). The BFF's webhook receiver uses these so the provider
 * details live with the connector, not the gateway.
 */
export const SHOPIFY_MANIFEST: ConnectorManifest = {
  provider: 'shopify',
  category: 'storefront',
  tier: 1,
  auth: 'oauth2',
  ingest: ['push'],
  streams: [
    { name: 'orders', mode: 'push', primaryKey: 'id' },
    { name: 'products', mode: 'push', primaryKey: 'id' },
    { name: 'customers', mode: 'push', primaryKey: 'id' },
    { name: 'inventory', mode: 'push' },
  ],
  backfill: 'bulk',
}

/** Topics we subscribe to for live data. Data topics fan out; app/uninstalled + GDPR are control. */
export const SHOPIFY_WEBHOOK_TOPICS = [
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'products/create',
  'products/update',
  'products/delete',
  'customers/create',
  'customers/update',
  'inventory_levels/update',
  'app/uninstalled',
] as const

/** Header carrying Shopify's per-delivery id — used for idempotency/dedup. */
export const SHOPIFY_WEBHOOK_ID_HEADER = 'x-shopify-webhook-id'

export const SHOPIFY_OAUTH_SCOPES = 'read_orders,read_products,read_customers,read_inventory,read_reports'

/** Verify a Shopify webhook HMAC (base64 over the raw body, app secret). */
export function verifyShopifyWebhook(rawBody: Buffer, hmacHeader: string | undefined, secret: string): boolean {
  return verifyHmac(rawBody, hmacHeader, secret, 'base64')
}

const DATA_STREAM_BY_TOPIC_PREFIX: Record<string, string> = {
  orders: 'orders',
  products: 'products',
  customers: 'customers',
  inventory_levels: 'inventory',
}

/** Map a verified webhook to normalized records (or a control signal). */
export function mapShopifyWebhook(ctx: WebhookContext): WebhookMapped {
  const topic = ctx.headers['x-shopify-topic'] ?? ''
  const shop = (ctx.headers['x-shopify-shop-domain'] ?? '').toLowerCase().replace(/^https?:\/\//, '').split('/')[0]
  if (topic === 'app/uninstalled') return { topic, shop, records: [], control: 'uninstall' }
  if (topic === 'shop/redact' || topic === 'customers/redact' || topic === 'customers/data_request') {
    return { topic, shop, records: [], control: 'gdpr' }
  }
  const stream = DATA_STREAM_BY_TOPIC_PREFIX[topic.split('/')[0]] ?? topic
  let data: unknown = {}
  try {
    data = ctx.rawBody.length ? JSON.parse(ctx.rawBody.toString('utf8')) : {}
  } catch {
    data = {}
  }
  return { topic, shop, records: [{ stream, data }] }
}
