import {
  type ConnectorHooks,
  type ConnectorManifest,
  type OrderRecord,
  type WebhookContext,
  type WebhookMapped,
  verifyHmac,
} from '@brain/connector-kit'

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

interface ShopifyOrder {
  id?: number | string
  name?: string
  total_price?: string
  currency?: string
  financial_status?: string
  fulfillment_status?: string | null
  customer?: { id?: number | string } | null
  created_at?: string
}

/** Normalize a Shopify order payload to the canonical OrderRecord (vendor-agnostic brain.orders). */
function normalizeOrder(o: ShopifyOrder): OrderRecord {
  return {
    order_id: o.id != null ? String(o.id) : '',
    order_name: o.name ?? '',
    total_price: o.total_price ?? '0',
    currency: o.currency ?? '',
    financial_status: o.financial_status ?? '',
    fulfillment_status: o.fulfillment_status ?? '',
    customer_id: o.customer?.id != null ? String(o.customer.id) : '',
    ordered_at: o.created_at ?? '',
  }
}

/** Map a verified webhook to normalized records (or a control signal). */
export function mapShopifyWebhook(ctx: WebhookContext): WebhookMapped {
  const topic = ctx.headers['x-shopify-topic'] ?? ''
  const shop = (ctx.headers['x-shopify-shop-domain'] ?? '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
  if (topic === 'app/uninstalled') return { topic, shop, records: [], control: 'uninstall' }
  if (topic === 'shop/redact' || topic === 'customers/redact' || topic === 'customers/data_request') {
    return { topic, shop, records: [], control: 'gdpr' }
  }
  let payload: Record<string, unknown> = {}
  try {
    payload = ctx.rawBody.length ? (JSON.parse(ctx.rawBody.toString('utf8')) as Record<string, unknown>) : {}
  } catch {
    payload = {}
  }
  const stream = DATA_STREAM_BY_TOPIC_PREFIX[topic.split('/')[0]] ?? topic
  // Orders are normalized to the canonical OrderRecord; other streams pass through raw for now.
  const data = stream === 'orders' ? normalizeOrder(payload as ShopifyOrder) : payload
  return { topic, shop, records: [{ stream, data }] }
}

/** Connector hooks object — lets the generic webhook receiver drive Shopify via the contract. */
export const shopify: ConnectorHooks = {
  manifest: SHOPIFY_MANIFEST,
  webhookIdHeader: SHOPIFY_WEBHOOK_ID_HEADER,
  verifyWebhook: (ctx, secret) => verifyShopifyWebhook(ctx.rawBody, ctx.headers['x-shopify-hmac-sha256'], secret),
  mapWebhook: mapShopifyWebhook,
}
