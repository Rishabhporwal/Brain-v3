/**
 * The connector contract. Every connector declares a `manifest` and implements the `hooks` its provider
 * supports; the framework (_kit) drives scheduling, rate-limits, retries, DLQ, health and publishing. This
 * is what makes connector #4…#100 a template-fill rather than bespoke code.
 */

export type IngestMode = 'push' | 'pull' | 'owned'
export type AuthKind = 'oauth2' | 'apikey' | 'basic'
export type BackfillKind = 'bulk' | 'paginated' | 'none'

/** A logical data stream a connector produces (vendor-agnostic downstream: orders, ad_spend, shipments…). */
export interface StreamDef {
  name: string
  mode: IngestMode
  primaryKey?: string
  cursorField?: string
}

export interface ConnectorManifest {
  provider: string // shopify, google-ads, meta-ads, …
  category: string // storefront | ads | payments | logistics | messaging | crm
  tier: 1 | 2 | 3
  auth: AuthKind
  ingest: IngestMode[]
  streams: StreamDef[]
  backfill?: BackfillKind
}

/** One normalized record emitted onto the backbone. Downstream consumes streams, never vendors. */
export interface IngestRecord {
  stream: string
  primaryKey?: string
  data: unknown
}

/** Canonical order shape — every storefront connector normalizes to this so brain.orders is vendor-agnostic. */
export interface OrderRecord {
  order_id: string
  order_name: string
  total_price: string // decimal string in the order currency
  currency: string
  financial_status: string // paid | pending | refunded | …
  fulfillment_status: string
  customer_id: string
  ordered_at: string // ISO8601
}

/** Canonical payment shape — every payments connector normalizes to this for brain.payments. */
export interface PaymentRecord {
  payment_id: string
  order_ref: string
  amount_minor: string // integer-as-string, minor units
  currency: string
  status: string // captured | failed | refunded | …
  method: string
  created_at: string // ISO8601
}

export interface WebhookContext {
  rawBody: Buffer
  headers: Record<string, string | undefined>
}

/** Result of a connector mapping an inbound webhook to normalized records (+ optional control signal). */
export interface WebhookMapped {
  topic: string
  shop?: string // provider account/shop identifier used to resolve the brand
  records: IngestRecord[]
  control?: 'uninstall' | 'gdpr'
}

/** A pull result for one stream/cursor cycle. */
export interface PullResult {
  records: IngestRecord[]
  nextCursor?: string
}

/** Token set persisted to the vault after connect (only `secret_ref` hits the DB, never the material). */
export interface TokenSet {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  scope?: string
  meta?: Record<string, unknown> // e.g. shop domain, ad-account id, login-customer-id
}

export interface AuthorizeInput {
  brandId: string
  state: string // pre-signed by _kit/oauth (CSRF)
  redirectUri: string
  account?: string // shop domain / instance url where the provider requires it
}

export interface ExchangeInput {
  code: string
  redirectUri: string
  account?: string
}

/**
 * Hooks a connector may implement. Only implement what the provider supports — `_kit` supplies the rest
 * (state signing, HMAC verify, dedupe, scheduling, rate-limiting, retries, DLQ, health).
 */
export interface ConnectorHooks {
  manifest: ConnectorManifest

  // --- connect / authorize (ALWAYS first — no ingestion without a vaulted token) ---
  /** OAuth2: build the consent URL (state pre-signed by _kit/oauth). */
  authorizeUrl?(input: AuthorizeInput): string
  /** OAuth2: exchange the auth code for a token set (→ vault). */
  exchangeCode?(input: ExchangeInput): Promise<TokenSet>
  /** apikey/basic: validate credentials against the live provider before we store them. */
  validateCredentials?(creds: Record<string, string>): Promise<{ ok: boolean; error?: string }>

  // --- push (webhooks) ---
  /** Webhook id header used for idempotency/dedup (e.g. x-shopify-webhook-id). */
  webhookIdHeader?: string
  /** Verify the inbound signature over the raw body. */
  verifyWebhook?(ctx: WebhookContext, secret: string): boolean
  /** Map a verified webhook to normalized records (+ control signal). */
  mapWebhook?(ctx: WebhookContext): WebhookMapped
  /** Subscribe the connected account to our webhook topics (after connect). */
  registerWebhooks?(account: string, accessToken: string): Promise<{ registered: number; errors: string[] }>

  // --- pull (polling) ---
  /** Refresh an access token (OAuth refresh-token grant) — called by the scheduler before pull if expiring. */
  refresh?(token: TokenSet): Promise<TokenSet>
  /** Pull one stream from a cursor; return records + the next cursor. */
  pull?(stream: string, cursor: string | undefined, accessToken: string): Promise<PullResult>
}
