import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { Pool } from 'pg'
import { PG_POOL } from '../persistence/db.providers'
import { VAULT, type Vault } from '../infrastructure/secrets/vault'
import { EVENT_BUS, type EventBus } from '../infrastructure/messaging/events'
import { safeReturnTo, signOAuthState, verifyOAuthState } from '../infrastructure/auth/oauth-state'
import type { AuthUser } from './bff.service'

/** Normalised token bundle stored (encrypted) in the vault. */
interface TokenBundle {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

interface ProviderCfg {
  clientId?: string
  clientSecret?: string
  redirectUri: string
  scopes: string
}

/**
 * Generic OAuth2 authorization-code flow for standard providers (Google Ads, Meta Ads). Mirrors the
 * Shopify service's contract — connect → signed-state consent URL; callback → verify state, exchange
 * code, vault the token (DB keeps only `secret_ref`), mark connected + emit `integration.connected`.
 * Falls back to the dev-stub when a provider's credentials are unset.
 */
@Injectable()
export class OAuthService {
  private readonly log = new Logger(OAuthService.name)
  static readonly PROVIDERS = ['google', 'meta'] as const

  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(VAULT) private readonly vault: Vault,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  private stateSecret(): string {
    return process.env.OAUTH_STATE_SECRET ?? process.env.AUTH_SECRET ?? 'brain-dev-oauth-state'
  }
  private get webBase(): string {
    return process.env.WEB_BASE ?? 'http://localhost:3000'
  }
  private nowSeconds(): number {
    return Math.floor(Date.now() / 1000)
  }

  private cfg(provider: string): ProviderCfg {
    if (provider === 'google') {
      return {
        clientId: process.env.GOOGLE_ADS_CLIENT_ID,
        clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_ADS_REDIRECT_URI ?? `${this.webBase}/api/integrations/google/callback`,
        scopes: process.env.GOOGLE_ADS_SCOPES ?? 'https://www.googleapis.com/auth/adwords',
      }
    }
    if (provider === 'meta') {
      return {
        clientId: process.env.META_APP_ID,
        clientSecret: process.env.META_APP_SECRET,
        redirectUri: process.env.META_REDIRECT_URI ?? `${this.webBase}/api/integrations/meta/callback`,
        scopes: process.env.META_SCOPES ?? 'ads_read',
      }
    }
    throw new BadRequestException(`unsupported provider: ${provider}`)
  }

  isConfigured(provider: string): boolean {
    const c = this.cfg(provider)
    return Boolean(c.clientId && c.clientSecret)
  }

  /** Build the consent URL, or dev-stub the connection when the provider is unconfigured. */
  async connect(
    user: AuthUser,
    slug: string,
    provider: string,
    returnTo?: string,
  ): Promise<{ mode: 'oauth'; url: string } | { mode: 'stub'; connected: true }> {
    const brand = await this.brand(slug)
    if (!this.isConfigured(provider)) {
      await this.markConnected(provider, brand.id, user, { stub: true })
      return { mode: 'stub', connected: true }
    }
    const state = signOAuthState(this.stateSecret(), {
      provider,
      brandId: brand.id,
      exp: this.nowSeconds() + 600,
      returnTo: safeReturnTo(returnTo),
    })
    return { mode: 'oauth', url: this.authorizeUrl(provider, state) }
  }

  /** Handle the provider's redirect (forwarded by the web callback route). Returns where the browser goes next. */
  async callback(provider: string, query: Record<string, string>): Promise<string> {
    const fail = (reason: string) => `${this.webBase}/onboarding?connect_error=${encodeURIComponent(reason)}`
    if (query.error) return fail(query.error) // user denied or provider-side error
    if (!this.isConfigured(provider)) return fail(`${provider}_not_configured`)

    let payload: { provider: string; brandId: string; returnTo?: string }
    try {
      payload = verifyOAuthState(this.stateSecret(), query.state)
    } catch {
      return fail('bad_state')
    }
    if (payload.provider !== provider) return fail('provider_mismatch')
    if (!query.code) return fail('missing_code')
    const returnTo = safeReturnTo(payload.returnTo)

    let token: TokenBundle
    try {
      token = await this.exchangeCode(provider, query.code)
    } catch (e) {
      this.log.error(`${provider} token exchange failed: ${(e as Error).message}`)
      return fail('token_exchange_failed')
    }

    const integrationId = await this.markConnected(provider, payload.brandId, { sub: `${provider}-callback` }, {})
    const secretRef = `${provider}:${payload.brandId}`
    await this.vault.put(secretRef, JSON.stringify(token))
    const expiresAt = token.expires_in ? new Date((this.nowSeconds() + token.expires_in) * 1000).toISOString() : null
    await this.pg.query(
      `INSERT INTO integration.oauth_tokens(brand_id, integration_id, secret_ref, expires_at)
       VALUES ($1,$2,$3,$4) ON CONFLICT (secret_ref) DO UPDATE SET expires_at=$4, updated_at=now()`,
      [payload.brandId, integrationId, secretRef, expiresAt],
    )
    return `${this.webBase}${returnTo}${returnTo.includes('?') ? '&' : '?'}connected=${provider}`
  }

  /** List a brand's integrations with account detail + sync/health (Settings → Integrations). */
  async listForBrand(slug: string): Promise<
    Array<{ provider: string; status: string; quality_level: string; account: string | null; last_sync_at: string | null; completeness: number | null }>
  > {
    const brand = await this.brand(slug)
    const { rows } = await this.pg.query(
      `SELECT i.provider, i.status, i.quality_level,
              CASE WHEN i.provider IN ('shopify','woocommerce') THEN b.store_url END AS account,
              s.last_sync_at,
              h.completeness_score AS completeness
         FROM integration.integrations i
         JOIN platform.brands b ON b.id = i.brand_id
         LEFT JOIN integration.sync_state s ON s.integration_id = i.id
         LEFT JOIN integration.connector_health h ON h.integration_id = i.id
        WHERE i.brand_id=$1 ORDER BY i.provider`,
      [brand.id],
    )
    return rows as never
  }

  /** Disconnect an integration: mark disconnected, drop the vaulted token + its ref. */
  async disconnect(slug: string, provider: string): Promise<{ ok: true }> {
    const brand = await this.brand(slug)
    await this.pg.query(`UPDATE integration.integrations SET status='disconnected' WHERE brand_id=$1 AND provider=$2`, [brand.id, provider])
    await this.pg.query(`DELETE FROM integration.oauth_tokens WHERE secret_ref=$1`, [`${provider}:${brand.id}`])
    return { ok: true }
  }

  // ---- per-provider specifics ------------------------------------------------------------------

  private authorizeUrl(provider: string, state: string): string {
    const c = this.cfg(provider)
    const common = `client_id=${encodeURIComponent(c.clientId!)}&redirect_uri=${encodeURIComponent(c.redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(c.scopes)}`
    if (provider === 'google') {
      // access_type=offline + prompt=consent → guarantees a refresh_token.
      return `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&access_type=offline&prompt=consent&include_granted_scopes=true&${common}`
    }
    // meta
    const ver = process.env.META_API_VERSION ?? 'v21.0'
    return `https://www.facebook.com/${ver}/dialog/oauth?response_type=code&${common}`
  }

  private async exchangeCode(provider: string, code: string): Promise<TokenBundle> {
    const c = this.cfg(provider)
    if (provider === 'google') {
      const url = process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token'
      const body = new URLSearchParams({
        code,
        client_id: c.clientId!,
        client_secret: c.clientSecret!,
        redirect_uri: c.redirectUri,
        grant_type: 'authorization_code',
      })
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
      })
      if (!res.ok) throw new Error(`google token endpoint ${res.status}: ${await res.text().catch(() => '')}`)
      return (await res.json()) as TokenBundle
    }

    // meta — exchange code for a short-lived token, then upgrade to a long-lived one (best-effort).
    const ver = process.env.META_API_VERSION ?? 'v21.0'
    const base = process.env.META_TOKEN_URL ?? `https://graph.facebook.com/${ver}/oauth/access_token`
    const shortRes = await fetch(
      `${base}?client_id=${encodeURIComponent(c.clientId!)}&client_secret=${encodeURIComponent(c.clientSecret!)}&redirect_uri=${encodeURIComponent(c.redirectUri)}&code=${encodeURIComponent(code)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!shortRes.ok) throw new Error(`meta token endpoint ${shortRes.status}: ${await shortRes.text().catch(() => '')}`)
    const short = (await shortRes.json()) as TokenBundle
    try {
      const longRes = await fetch(
        `${base}?grant_type=fb_exchange_token&client_id=${encodeURIComponent(c.clientId!)}&client_secret=${encodeURIComponent(c.clientSecret!)}&fb_exchange_token=${encodeURIComponent(short.access_token)}`,
        { headers: { Accept: 'application/json' } },
      )
      if (longRes.ok) return (await longRes.json()) as TokenBundle
    } catch {
      /* keep the short-lived token if the upgrade fails */
    }
    return short
  }

  // ---- shared DB writes ------------------------------------------------------------------------

  private async markConnected(provider: string, brandId: string, actor: AuthUser, after: unknown): Promise<string> {
    const { rows } = await this.pg.query<{ id: string }>(
      `INSERT INTO integration.integrations(brand_id, provider, tier, quality_level, status)
       VALUES ($1,$2,'1','green','connected')
       ON CONFLICT (brand_id, provider) DO UPDATE SET status='connected', quality_level='green'
       RETURNING id`,
      [brandId, provider],
    )
    const payload = { provider, ...(after as object) }
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
}
