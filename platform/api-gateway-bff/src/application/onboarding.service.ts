import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import type { ClickHouseClient } from '@clickhouse/client'
import { CH_CLIENT, PG_POOL } from '../persistence/db.providers'
import { EVENT_BUS, type EventBus } from '../infrastructure/messaging/events'
import { VAULT, type Vault } from '../infrastructure/secrets/vault'
import { ShopifyService } from './shopify.service'
import { emailHash } from './identity.service'
import type { AuthUser } from './bff.service'

interface CompleteBody {
  fullName?: string
  role?: string
  brandName?: string
  slug?: string
  region?: string
  industry?: string
  monthlyRevenue?: string
  platform?: 'shopify' | 'woocommerce'
  storeUrl?: string
  connectShopify?: boolean
  wcStoreUrl?: string
  wcConsumerKey?: string
  wcConsumerSecret?: string
}

/**
 * The 7-step onboarding (Blueprint §2.9): org → brand → costs → tracking → integrations → validation → activation.
 * The brand is created `provisioning`; only the activation gate flips it to `active`. Every step writes an
 * append-only audit_log event (organization.created … brand.activated), mirroring the BRD event flow.
 */
@Injectable()
export class OnboardingService {
  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(CH_CLIENT) private readonly ch: ClickHouseClient,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(VAULT) private readonly vault: Vault,
    private readonly shopify: ShopifyService,
  ) {}

  private static readonly SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
  // Supported regions → currency + IANA timezone (Brain V2: India / UAE / KSA).
  private static readonly REGIONS: Record<string, { currency: string; tz: string }> = {
    IN: { currency: 'INR', tz: 'Asia/Kolkata' },
    AE: { currency: 'AED', tz: 'Asia/Dubai' },
    SA: { currency: 'SAR', tz: 'Asia/Riyadh' },
  }

  /**
   * Single-shot onboarding (ported from legacy `completeOnboarding`): profile → brand → platform →
   * connect → launch. Creates an org + ACTIVE brand + owner membership in one transaction (no activation
   * gate), then either returns a Shopify consent URL or a dashboard redirect. WooCommerce credentials are
   * validated against the live store before the workspace is created.
   */
  async complete(
    user: AuthUser,
    b: CompleteBody,
  ): Promise<{ shopifyAuthUrl?: string; redirectTo?: string; error?: string }> {
    const brandName = (b.brandName ?? '').trim()
    const slug = (b.slug ?? '').trim().toLowerCase()
    const platform = b.platform === 'woocommerce' ? 'woocommerce' : 'shopify'
    if (!brandName) throw new BadRequestException('Brand name is required.')
    if (!slug) throw new BadRequestException('Workspace URL is required.')
    if (!OnboardingService.SLUG_RE.test(slug)) {
      throw new BadRequestException(
        'URL must start and end with a letter or number, and can only contain lowercase letters, numbers, and hyphens.',
      )
    }
    if (await this.slugTaken(slug))
      throw new ConflictException('This workspace URL is already taken. Please choose another.')

    const region = b.region && OnboardingService.REGIONS[b.region] ? b.region : 'IN'
    const { currency, tz } = OnboardingService.REGIONS[region]
    const shopDomain = b.storeUrl ? this.normalizeShopDomain(b.storeUrl) : null
    const wantsShopify = platform === 'shopify' && Boolean(b.connectShopify) && Boolean(shopDomain)
    const wantsWoo =
      platform === 'woocommerce' &&
      Boolean(b.wcStoreUrl?.trim() && b.wcConsumerKey?.trim() && b.wcConsumerSecret?.trim())

    // Validate WooCommerce credentials against the live store BEFORE creating anything.
    if (wantsWoo) {
      const test = await this.testWoocommerce(b.wcStoreUrl!.trim(), b.wcConsumerKey!.trim(), b.wcConsumerSecret!.trim())
      if (!test.ok) return { error: `WooCommerce connection failed: ${test.error ?? 'Invalid credentials'}` }
    }

    const uid = await this.userId(user.sub, user.email, b.fullName, b.role)
    const client = await this.pg.connect()
    let brandId: string
    try {
      await client.query('BEGIN')
      const orgId = await this.createOrg(client, brandName, slug, region, currency, tz)
      const brand = await client.query<{ id: string }>(
        `INSERT INTO platform.brands
           (organization_id,name,slug,region,currency,timezone,industry,monthly_revenue,platform,store_url,status,activated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',now()) RETURNING id`,
        [
          orgId,
          brandName,
          slug,
          region,
          currency,
          tz,
          b.industry || null,
          b.monthlyRevenue || null,
          platform,
          shopDomain,
        ],
      )
      brandId = brand.rows[0].id
      const role = await client.query<{ id: string }>(
        `SELECT id FROM platform.roles WHERE scope='org' AND name='Owner' LIMIT 1`,
      )
      // Owner is an ORG-LEVEL membership (brand_id NULL): one row grants the registrant Owner access to
      // EVERY brand in the org (resolveBrandContext reaches brands via org-level memberships). New brands
      // in the same org need no extra Owner row.
      await client.query(
        `INSERT INTO platform.memberships(user_id,organization_id,brand_id,role_id,state) VALUES ($1,$2,NULL,$3,'active')`,
        [uid, orgId, role.rows[0].id],
      )
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    await this.audit(brandId, user, 'organization.created', { name: brandName })
    await this.audit(brandId, user, 'brand.created', { slug, status: 'active' })

    if (wantsWoo) {
      await this.connectWoocommerce(
        brandId,
        user,
        b.wcStoreUrl!.trim(),
        b.wcConsumerKey!.trim(),
        b.wcConsumerSecret!.trim(),
      )
    }

    // Shopify: hand back the consent URL (the wizard navigates the browser to it); the callback returns
    // to the dashboard. If Shopify creds are unset the connect dev-stubs and we just launch.
    if (wantsShopify && shopDomain) {
      const r = await this.shopify.connect(user, slug, shopDomain, `/w/${slug}/dashboard`)
      if (r.mode === 'oauth') return { shopifyAuthUrl: r.url }
    }
    return { redirectTo: `/w/${slug}/dashboard` }
  }

  // Create the org for a brand. org.name is globally UNIQUE, so fall back to a slug-suffixed name on clash.
  private async createOrg(
    client: import('pg').PoolClient,
    name: string,
    slug: string,
    region: string,
    currency: string,
    tz: string,
  ): Promise<string> {
    const ins = async (n: string) =>
      client.query<{ id: string }>(
        `INSERT INTO platform.organizations(name,region,currency,timezone,billing_basis)
         VALUES ($1,$2,$3,$4,'gmv_percent') ON CONFLICT (name) DO NOTHING RETURNING id`,
        [n, region, currency, tz],
      )
    const first = await ins(name)
    if (first.rows[0]) return first.rows[0].id
    const second = await ins(`${name} (${slug})`)
    return second.rows[0].id
  }

  private normalizeShopDomain(raw: string): string {
    const handle = raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/\.myshopify\.com$/i, '')
    return `${handle}.myshopify.com`
  }

  // Validate WooCommerce REST creds against the live store (HTTP Basic over the v3 API root).
  private async testWoocommerce(
    storeUrl: string,
    key: string,
    secret: string,
  ): Promise<{ ok: boolean; error?: string }> {
    let base = storeUrl.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(base)) base = `https://${base}`
    try {
      const origin = new URL(base).origin
      const auth = Buffer.from(`${key}:${secret}`).toString('base64')
      const res = await fetch(`${origin}/wp-json/wc/v3/`, { headers: { Authorization: `Basic ${auth}` } })
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  private async connectWoocommerce(brandId: string, user: AuthUser, storeUrl: string, key: string, secret: string) {
    const { rows } = await this.pg.query<{ id: string }>(
      `INSERT INTO integration.integrations(brand_id,provider,tier,quality_level,status)
       VALUES ($1,'woocommerce','1','green','connected')
       ON CONFLICT (brand_id,provider) DO UPDATE SET status='connected',quality_level='green' RETURNING id`,
      [brandId],
    )
    // Pin the store URL on the brand so inbound WooCommerce webhooks resolve store → brand.
    await this.pg.query(`UPDATE platform.brands SET store_url=$1 WHERE id=$2`, [storeUrl.replace(/\/+$/, ''), brandId])
    const secretRef = `woocommerce:${brandId}`
    await this.vault.put(
      secretRef,
      JSON.stringify({ storeUrl: storeUrl.replace(/\/+$/, ''), consumerKey: key, consumerSecret: secret }),
    )
    await this.pg.query(
      `INSERT INTO integration.oauth_tokens(brand_id,integration_id,secret_ref) VALUES ($1,$2,$3)
       ON CONFLICT (secret_ref) DO UPDATE SET updated_at=now()`,
      [brandId, rows[0].id, secretRef],
    )
    await this.audit(brandId, user, 'integration.connected', { provider: 'woocommerce' })
    this.bus.emit({
      type: 'integration.connected',
      brandId,
      actor: user.email ?? user.sub,
      payload: { provider: 'woocommerce' },
    })
  }

  private async userId(sub: string, email?: string, fullName?: string, role?: string): Promise<string> {
    const name = fullName?.trim() || email || null
    // Key on the verified email (same scheme as IdentityService) so the registrant resolves to the SAME
    // platform.users row on every subsequent request. Falls back to sub only when no email is present.
    const key = email ? emailHash(email) : sub
    const { rows } = await this.pg.query<{ id: string }>(
      `INSERT INTO platform.users(email_hash, display_name, job_role) VALUES ($1,$2,$3)
       ON CONFLICT (email_hash) DO UPDATE SET
         display_name = COALESCE($2, platform.users.display_name),
         job_role     = COALESCE($3, platform.users.job_role)
       RETURNING id`,
      [key, name, role || null],
    )
    return rows[0].id
  }

  private async brand(slug: string) {
    const { rows } = await this.pg.query<{ id: string; slug: string; status: string }>(
      `SELECT id, slug, status FROM platform.brands WHERE slug = $1 LIMIT 1`,
      [slug],
    )
    if (!rows[0]) throw new NotFoundException('workspace not found')
    return rows[0]
  }

  // Onboarding lifecycle stays in audit_logs only — it does NOT go on the Kafka backbone (that's the
  // integration/data layer). Integration connections (e.g. WooCommerce below) emit separately.
  private async audit(brandId: string | null, actor: AuthUser, action: string, after?: unknown) {
    await this.pg.query(
      `INSERT INTO platform.audit_logs(brand_id, actor_type, actor_id, action, after)
       VALUES ($1,'user',$2,$3,$4)`,
      [brandId, actor.email ?? actor.sub, action, after ? JSON.stringify(after) : null],
    )
  }

  private async slugTaken(slug: string) {
    const { rowCount } = await this.pg.query(`SELECT 1 FROM platform.brands WHERE slug=$1 LIMIT 1`, [slug])
    return Boolean(rowCount)
  }

  // Settings → Costs — cost configuration (drives honest CM). Kept from the old wizard; now a settings surface.
  async configureCosts(user: AuthUser, slug: string, b: Record<string, number>) {
    const br = await this.brand(slug)
    const rows: Array<[string, number | null, number | null]> = [
      ['cogs', null, Math.round((b.cogsPct ?? 0) * 100)], // rate_bps
      ['fwd_shipping', Math.round(b.shippingMinor ?? 0), null],
      ['cod_fee', Math.round(b.codFeeMinor ?? 0), null],
      ['gateway_fee', null, Math.round((b.gatewayPct ?? 0) * 100)],
    ]
    for (const [key, valueMinor, rateBps] of rows) {
      await this.pg.query(
        `INSERT INTO commerce.cost_config(brand_id,scope,key,value_minor,rate_bps,valid_from)
         VALUES ($1,'brand',$2,$3,$4,now())
         ON CONFLICT (brand_id,scope,scope_ref,key,valid_from) DO NOTHING`,
        [br.id, key, valueMinor, rateBps],
      )
    }
    await this.audit(br.id, user, 'cost.configured')
    return { ok: true }
  }

  /** Read the brand's current cost configuration (for the Settings → Costs surface). */
  async getCosts(
    slug: string,
  ): Promise<{ cogsPct: number; shippingMinor: number; codFeeMinor: number; gatewayPct: number }> {
    const br = await this.brand(slug)
    const { rows } = await this.pg.query<{ key: string; value_minor: number | null; rate_bps: number | null }>(
      `SELECT DISTINCT ON (key) key, value_minor, rate_bps FROM commerce.cost_config
        WHERE brand_id=$1 ORDER BY key, valid_from DESC`,
      [br.id],
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    return {
      cogsPct: Number(by.cogs?.rate_bps ?? 0) / 100,
      shippingMinor: Number(by.fwd_shipping?.value_minor ?? 0),
      codFeeMinor: Number(by.cod_fee?.value_minor ?? 0),
      gatewayPct: Number(by.gateway_fee?.rate_bps ?? 0) / 100,
    }
  }

  // Settings → Tracking — issue a first-party write-key (+ snippet). Kept from the old wizard.
  async issueTracking(user: AuthUser, slug: string) {
    const br = await this.brand(slug)
    const existing = await this.pg.query<{ write_key: string }>(
      `SELECT write_key FROM tracking.tracking_keys WHERE brand_id=$1 AND status='active' LIMIT 1`,
      [br.id],
    )
    const writeKey = existing.rows[0]?.write_key ?? `brn_${randomBytes(16).toString('hex')}`
    if (!existing.rows[0]) {
      await this.pg.query(`INSERT INTO tracking.tracking_keys(brand_id,write_key,status) VALUES ($1,$2,'active')`, [
        br.id,
        writeKey,
      ])
      await this.audit(br.id, user, 'tracking.installed', { writeKey })
    }
    return { writeKey, snippet: this.snippet(writeKey) }
  }

  /**
   * Real verification (M1): confirm ≥1 event actually landed in ClickHouse for this brand before
   * marking the key verified. No false-positive — if no events, returns `verified:false`.
   */
  async verifyTracking(user: AuthUser, slug: string): Promise<{ slug: string; verified: boolean; events: number }> {
    const br = await this.brand(slug)
    const events = await this.eventCount(br.id)
    if (events === 0) return { slug, verified: false, events }
    const { rowCount } = await this.pg.query(
      `UPDATE tracking.tracking_keys SET verified_at=now() WHERE brand_id=$1 AND status='active' AND verified_at IS NULL`,
      [br.id],
    )
    if (rowCount) await this.audit(br.id, user, 'tracking.verified', { events })
    return { slug, verified: true, events }
  }

  /** Count first-party events for a brand (scoped by the row-policy setting). */
  private async eventCount(brandId: string): Promise<number> {
    const rs = await this.ch.query({
      query: `SELECT count() AS n FROM brain.customer_events WHERE brand_id = {b:UUID}`,
      query_params: { b: brandId },
      format: 'JSONEachRow',
      clickhouse_settings: { brain_current_brand: brandId },
    })
    const rows = (await rs.json()) as Array<{ n: string }>
    return Number(rows[0]?.n ?? 0)
  }

  private snippet(writeKey: string) {
    return `<script>(function(){window.brain=window.brain||[];window.BRAIN_KEY=${JSON.stringify(writeKey)};\n  var s=document.createElement('script');s.async=1;s.src='https://cdn.brain.app/sdk.js';document.head.appendChild(s);})();</script>`
  }
}
