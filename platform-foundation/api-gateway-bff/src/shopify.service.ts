import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Pool } from 'pg'
import { PG_POOL } from './db.providers'
import { VAULT, type Vault } from './vault'
import { EVENT_BUS, type EventBus } from './events'
import { safeReturnTo } from './oauth-state'
import type { AuthUser } from './bff.service'

/**
 * M3 — real Shopify OAuth (authorization-code) flow.
 *  connect:  GET …/integrations/shopify/connect?shop=… → signed-state authorize URL (or dev-stub if unconfigured)
 *  callback: GET /api/integrations/shopify/callback    → verify HMAC + state → exchange code → vault → connected
 *
 * Secret material (the access token) goes to the Vault; the DB keeps only a `secret_ref`. When the app
 * credentials are unset we fall back to the dev-stub so the wizard still builds/runs end-to-end.
 */
@Injectable()
export class ShopifyService {
  private readonly log = new Logger(ShopifyService.name)
  // Shopify shop domains: <name>.myshopify.com (lowercase letters, digits, dashes).
  private static readonly SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/

  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(VAULT) private readonly vault: Vault,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  private get clientId() {
    return process.env.SHOPIFY_CLIENT_ID
  }
  private get clientSecret() {
    return process.env.SHOPIFY_CLIENT_SECRET
  }
  isConfigured() {
    return Boolean(this.clientId && this.clientSecret)
  }
  private get scopes() {
    return process.env.SHOPIFY_SCOPES ?? 'read_orders,read_products'
  }
  private get webBase() {
    return process.env.WEB_BASE ?? 'http://localhost:3000'
  }
  // The browser-facing callback (must be whitelisted in the Shopify app). Lands on the web app, which
  // forwards to this BFF for the token exchange. Falls back to the web base when not set explicitly.
  private get redirectUri() {
    return process.env.SHOPIFY_REDIRECT_URI ?? `${this.webBase}/api/integrations/shopify/callback`
  }

  // ---- pure, unit-testable crypto helpers -------------------------------------------------------

  /** Sign `{brandId, shop, nonce, exp}` into an opaque, tamper-evident state string (CSRF defence). */
  signState(payload: { brandId: string; shop: string; exp: number; returnTo?: string }): string {
    const body = Buffer.from(
      JSON.stringify({ ...payload, nonce: randomBytes(8).toString('hex') }),
    ).toString('base64url')
    const sig = createHmac('sha256', this.clientSecret ?? 'dev').update(body).digest('base64url')
    return `${body}.${sig}`
  }

  verifyState(state: string): { brandId: string; shop: string; exp: number } {
    const [body, sig] = state.split('.')
    if (!body || !sig) throw new BadRequestException('malformed state')
    const expected = createHmac('sha256', this.clientSecret ?? 'dev').update(body).digest('base64url')
    if (!this.safeEqual(sig, expected)) throw new BadRequestException('bad state signature')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      brandId: string
      shop: string
      exp: number
      returnTo?: string
    }
    if (payload.exp < this.nowSeconds()) throw new BadRequestException('state expired')
    return payload
  }

  /** Shopify callback HMAC: HMAC-SHA256 over the sorted query (minus hmac/signature), hex, constant-time. */
  verifyCallbackHmac(query: Record<string, string>): boolean {
    const { hmac, signature: _sig, ...rest } = query
    if (!hmac) return false
    const message = Object.keys(rest)
      .sort()
      .map((k) => `${k}=${rest[k]}`)
      .join('&')
    const digest = createHmac('sha256', this.clientSecret ?? 'dev').update(message).digest('hex')
    return this.safeEqual(digest, hmac)
  }

  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    return ab.length === bb.length && timingSafeEqual(ab, bb)
  }

  private nowSeconds(): number {
    return Math.floor(Date.now() / 1000)
  }

  // ---- flow ------------------------------------------------------------------------------------

  /** Build the consent URL for a shop, or fall back to the dev-stub connect when unconfigured. */
  async connect(user: AuthUser, slug: string, shop?: string, returnTo?: string): Promise<{ mode: 'oauth'; url: string } | { mode: 'stub'; connected: true }> {
    const brand = await this.brand(slug)
    if (!this.isConfigured()) {
      await this.markConnected(brand.id, user, { stub: true })
      return { mode: 'stub', connected: true }
    }
    if (!shop || !ShopifyService.SHOP_RE.test(shop)) {
      throw new BadRequestException('a valid <store>.myshopify.com domain is required')
    }
    const state = this.signState({ brandId: brand.id, shop, exp: this.nowSeconds() + 600, returnTo: safeReturnTo(returnTo) })
    const url =
      `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(this.clientId!)}` +
      `&scope=${encodeURIComponent(this.scopes)}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&state=${encodeURIComponent(state)}`
    return { mode: 'oauth', url }
  }

  /** Handle Shopify's redirect: verify, exchange, vault the token, mark connected. Returns a web redirect. */
  async callback(query: Record<string, string>): Promise<string> {
    const fail = (reason: string) => `${this.webBase}/onboarding?connect_error=${encodeURIComponent(reason)}`
    if (!this.isConfigured()) return fail('shopify_not_configured')
    if (!this.verifyCallbackHmac(query)) return fail('bad_hmac')
    let payload: { brandId: string; shop: string; returnTo?: string }
    try {
      payload = this.verifyState(query.state)
    } catch {
      return fail('bad_state')
    }
    if (query.shop !== payload.shop) return fail('shop_mismatch')

    let token: { access_token: string; scope: string }
    try {
      token = await this.exchangeCode(payload.shop, query.code)
    } catch (e) {
      this.log.error(`token exchange failed: ${(e as Error).message}`)
      return fail('token_exchange_failed')
    }

    const integrationId = await this.markConnected(payload.brandId, { sub: 'shopify-callback' }, { shop: payload.shop })
    const secretRef = `shopify:${payload.brandId}`
    await this.vault.put(secretRef, JSON.stringify({ shop: payload.shop, ...token }))
    await this.pg.query(
      `INSERT INTO integration.oauth_tokens(brand_id, integration_id, secret_ref)
       VALUES ($1,$2,$3) ON CONFLICT (secret_ref) DO UPDATE SET updated_at = now()`,
      [payload.brandId, integrationId, secretRef],
    )
    // Pin the shop on the brand so inbound webhooks resolve shop → brand.
    await this.pg.query(`UPDATE platform.brands SET store_url=$1 WHERE id=$2`, [payload.shop, payload.brandId])

    // Subscribe to real-time webhooks (best-effort — needs a public webhook URL; never blocks the connect).
    void this.registerWebhooks(payload.shop, token.access_token).catch((e) =>
      this.log.warn(`webhook registration failed for ${payload.shop}: ${(e as Error).message}`),
    )

    const returnTo = safeReturnTo(payload.returnTo)
    return `${this.webBase}${returnTo}${returnTo.includes('?') ? '&' : '?'}connected=shopify`
  }

  /** Exchange the auth code for an access token. Overridable token URL (SHOPIFY_TOKEN_URL) for tests/mocks. */
  private async exchangeCode(shop: string, code: string): Promise<{ access_token: string; scope: string }> {
    const url = process.env.SHOPIFY_TOKEN_URL ?? `https://${shop}/admin/oauth/access_token`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: this.clientId, client_secret: this.clientSecret, code }),
    })
    if (!res.ok) throw new Error(`shopify token endpoint ${res.status}`)
    return (await res.json()) as { access_token: string; scope: string }
  }

  // upsert the integration row → connected; returns its id.
  private async markConnected(brandId: string, actor: AuthUser, after: unknown): Promise<string> {
    const { rows } = await this.pg.query<{ id: string }>(
      `INSERT INTO integration.integrations(brand_id, provider, tier, quality_level, status)
       VALUES ($1,'shopify','1','green','connected')
       ON CONFLICT (brand_id, provider) DO UPDATE SET status='connected', quality_level='green'
       RETURNING id`,
      [brandId],
    )
    const payload = { provider: 'shopify', ...(after as object) }
    await this.pg.query(
      `INSERT INTO platform.audit_logs(brand_id, actor_type, actor_id, action, after)
       VALUES ($1,'user',$2,'integration.connected',$3)`,
      [brandId, actor.email ?? actor.sub, JSON.stringify(payload)],
    )
    this.bus.emit({ type: 'integration.connected', brandId, actor: actor.email ?? actor.sub, payload })
    return rows[0].id
  }

  private async brand(slug: string): Promise<{ id: string }> {
    const { rows } = await this.pg.query<{ id: string }>(`SELECT id FROM platform.brands WHERE slug=$1 LIMIT 1`, [slug])
    if (!rows[0]) throw new BadRequestException('workspace not found')
    return rows[0]
  }

  // ---- webhooks (real-time data) ---------------------------------------------------------------

  // Topics we subscribe to for live data. Data topics fan out to Kafka; app/uninstalled + GDPR are control.
  private static readonly WEBHOOK_TOPICS = [
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

  private get apiVersion() {
    return process.env.SHOPIFY_API_VERSION ?? '2025-01'
  }
  // Public URL Shopify will POST webhooks to (needs a tunnel locally; Shopify can't reach localhost).
  private get webhookAddress() {
    return `${process.env.SHOPIFY_WEBHOOK_BASE ?? this.webBase}/api/webhooks/shopify`
  }

  /** Subscribe a connected shop to our webhook topics (REST Admin API). Best-effort; idempotent (422=exists). */
  async registerWebhooks(shop: string, accessToken: string): Promise<{ registered: number; errors: string[] }> {
    const adminBase = process.env.SHOPIFY_ADMIN_URL ?? `https://${shop}` // override for tests/mocks
    const address = this.webhookAddress
    const errors: string[] = []
    let registered = 0
    for (const topic of ShopifyService.WEBHOOK_TOPICS) {
      try {
        const res = await fetch(`${adminBase}/admin/api/${this.apiVersion}/webhooks.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
        })
        if (res.ok || res.status === 422) registered++ // 422 = subscription already exists
        else errors.push(`${topic}: HTTP ${res.status}`)
      } catch (e) {
        errors.push(`${topic}: ${(e as Error).message}`)
      }
    }
    this.log.log(`shopify webhooks registered ${registered}/${ShopifyService.WEBHOOK_TOPICS.length} for ${shop}`)
    return { registered, errors }
  }

  /** Verify a Shopify webhook: HMAC-SHA256 of the RAW body with the app secret, base64, constant-time. */
  verifyWebhookHmac(rawBody: Buffer, header?: string): boolean {
    if (!header) return false
    const digest = createHmac('sha256', this.clientSecret ?? 'dev').update(rawBody).digest('base64')
    const a = Buffer.from(digest)
    const b = Buffer.from(header)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private async brandIdByShop(shop: string): Promise<string | null> {
    const { rows } = await this.pg.query<{ id: string }>(
      `SELECT id FROM platform.brands WHERE store_url=$1 ORDER BY created_at DESC LIMIT 1`,
      [shop],
    )
    return rows[0]?.id ?? null
  }

  /**
   * Inbound webhook handler. Verifies the signature, resolves the brand from the shop, and publishes the
   * raw payload to the Kafka data plane (a downstream consumer normalizes into ClickHouse). app/uninstalled
   * disconnects the integration; GDPR topics are acknowledged. Returns the HTTP status to reply with.
   */
  async handleWebhook(opts: { shop?: string; topic?: string; hmac?: string; rawBody: Buffer }): Promise<{ status: number }> {
    const { shop, topic, hmac, rawBody } = opts
    if (!shop || !topic) return { status: 400 }
    if (!this.verifyWebhookHmac(rawBody, hmac)) return { status: 401 }

    const normShop = shop.toLowerCase().replace(/^https?:\/\//, '').split('/')[0]
    const brandId = await this.brandIdByShop(normShop)

    if (topic === 'app/uninstalled') {
      if (brandId) {
        await this.pg.query(`UPDATE integration.integrations SET status='disconnected' WHERE brand_id=$1 AND provider='shopify'`, [brandId])
      }
      return { status: 200 }
    }
    if (topic === 'shop/redact' || topic === 'customers/redact' || topic === 'customers/data_request') {
      return { status: 200 } // GDPR compliance ack
    }

    if (!brandId) return { status: 202 } // accepted, but no brand mapped to this shop yet
    let payload: unknown
    try {
      payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}
    } catch {
      return { status: 400 }
    }
    this.bus.emitWebhook({ provider: 'shopify', topic, brandId, shop: normShop, payload })
    return { status: 200 }
  }
}
