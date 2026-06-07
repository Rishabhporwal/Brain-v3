import {
  type AuthorizeInput,
  type ConnectorHooks,
  type ConnectorManifest,
  type ExchangeInput,
  type PullResult,
  type TokenSet,
  type WebhookContext,
  type WebhookMapped,
  verifyHmac,
} from '@brain/connector-kit'

/**
 * Connector cookiecutter. To add one of the 100+ apps:
 *   1) cp -r connectors/_template connectors/<provider>   (rename package to @brain/connector-<provider>)
 *   2) fill the manifest (auth kind, ingest lanes, streams)
 *   3) implement ONLY the hooks the provider supports — the framework (_kit) does the rest.
 *
 * Lifecycle is enforced by the contract: **connect/authorize first → vaulted token → only then ingest.**
 */
export const MANIFEST: ConnectorManifest = {
  provider: 'template',
  category: 'storefront', // storefront | ads | payments | logistics | messaging | crm
  tier: 3,
  auth: 'oauth2', // oauth2 | apikey | basic
  ingest: ['push'], // push | pull | owned
  streams: [{ name: 'orders', mode: 'push', primaryKey: 'id' }],
  backfill: 'none',
}

export const connector: ConnectorHooks = {
  manifest: MANIFEST,

  // ---- 1. CONNECT / AUTHORIZE (always before ingestion) ----
  // OAuth2 providers:
  authorizeUrl(input: AuthorizeInput): string {
    return `https://provider.example/oauth/authorize?client_id=...&redirect_uri=${encodeURIComponent(input.redirectUri)}&state=${encodeURIComponent(input.state)}`
  },
  async exchangeCode(_input: ExchangeInput): Promise<TokenSet> {
    // POST the code to the provider's token endpoint; return the token set (→ vault).
    return { accessToken: 'replace-me', refreshToken: undefined, expiresIn: 3600 }
  },
  // …OR apikey/basic providers implement validateCredentials() instead:
  // async validateCredentials(creds) { return { ok: true } },

  // ---- 2a. INGEST — push (webhooks) ----
  webhookIdHeader: 'x-provider-webhook-id',
  verifyWebhook(ctx: WebhookContext, secret: string): boolean {
    return verifyHmac(ctx.rawBody, ctx.headers['x-provider-hmac'], secret, 'base64')
  },
  mapWebhook(ctx: WebhookContext): WebhookMapped {
    const topic = ctx.headers['x-provider-topic'] ?? ''
    const data = ctx.rawBody.length ? JSON.parse(ctx.rawBody.toString('utf8')) : {}
    return { topic, records: [{ stream: 'orders', data }] }
  },

  // ---- 2b. INGEST — pull (polling) ----
  async pull(_stream: string, _cursor: string | undefined, _accessToken: string): Promise<PullResult> {
    return { records: [], nextCursor: undefined }
  },
}
