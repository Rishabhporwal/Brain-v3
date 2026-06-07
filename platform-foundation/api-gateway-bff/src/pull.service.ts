import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { Pool } from 'pg'
import { type ConnectorHooks, type CursorStore, type PullPublisher, type TokenSet, runConnectorSync } from '@brain/connector-kit'
import { googleAds } from '@brain/connector-google-ads'
import { metaAds } from '@brain/connector-meta-ads'
import { PG_POOL } from './db.providers'
import { VAULT, type Vault } from './vault'
import { EVENT_BUS, type EventBus } from './events'

/** Pull-lane connectors, keyed by the connect-layer provider id (matches integration.* + vault refs). */
const CONNECTORS: Record<string, ConnectorHooks> = {
  google: googleAds,
  meta: metaAds,
}

/**
 * Polling lane (P2). Loads the vaulted token (refreshing if expiring via the connector's refresh hook),
 * drives the connector's pull() through the kit's sync-engine (cursor in integration.sync_state), and
 * publishes pulled records to the Kafka data plane (brain.integration.pull). A downstream consumer (P3)
 * normalizes them into ClickHouse fact_spend.
 */
@Injectable()
export class PullService {
  private readonly log = new Logger(PullService.name)

  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(VAULT) private readonly vault: Vault,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  /** Run a sync cycle for a connected provider on a workspace. */
  async runSync(provider: string, slug: string): Promise<{ provider: string; slug: string; results: Array<{ stream: string; count: number }> }> {
    const connector = CONNECTORS[provider]
    if (!connector) throw new BadRequestException(`no pull connector for provider: ${provider}`)
    const brand = await this.brand(slug)
    const accessToken = await this.accessTokenFor(provider, brand.id, connector)

    const publish: PullPublisher = {
      publish: (p, b, s, records) =>
        this.bus.emitPull({ provider: p, brandId: b, stream: s, records: records as Array<{ primaryKey?: string; data: unknown }> }),
    }
    const results = await runConnectorSync(connector, brand.id, { cursors: this.cursorStore(), publish, accessToken })
    this.log.log(`pull ${provider} for ${slug}: ${results.map((r) => `${r.stream}=${r.count}`).join(', ')}`)
    return { provider, slug, results: results.map((r) => ({ stream: r.stream, count: r.count })) }
  }

  // Load the access token from the vault; refresh (and re-vault) if it's expiring and the connector supports it.
  private async accessTokenFor(provider: string, brandId: string, connector: ConnectorHooks): Promise<string> {
    const ref = `${provider}:${brandId}`
    const raw = await this.vault.get(ref)
    if (!raw) throw new BadRequestException(`${provider} is not connected for this workspace`)
    const t = JSON.parse(raw) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }
    let token: TokenSet = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in, scope: t.scope }

    const { rows } = await this.pg.query<{ expires_at: string | null }>(
      `SELECT expires_at FROM integration.oauth_tokens WHERE secret_ref=$1`,
      [ref],
    )
    const expiresAt = rows[0]?.expires_at ? new Date(rows[0].expires_at).getTime() : 0
    const expiringSoon = expiresAt > 0 && expiresAt < Date.now() + 60_000
    if (connector.refresh && token.refreshToken && expiringSoon) {
      try {
        token = await connector.refresh(token)
        await this.vault.put(ref, JSON.stringify({ access_token: token.accessToken, refresh_token: token.refreshToken, expires_in: token.expiresIn, scope: token.scope }))
        const newExp = token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000).toISOString() : null
        await this.pg.query(`UPDATE integration.oauth_tokens SET expires_at=$2, updated_at=now() WHERE secret_ref=$1`, [ref, newExp])
      } catch (e) {
        await this.pg.query(`UPDATE integration.oauth_tokens SET refresh_failed_at=now() WHERE secret_ref=$1`, [ref])
        this.log.warn(`token refresh failed for ${ref}: ${(e as Error).message}`)
      }
    }
    return token.accessToken
  }

  // Cursor persistence over integration.sync_state (one cursor per brand+provider for now). Key = provider:brandId:stream.
  private cursorStore(): CursorStore {
    const pg = this.pg
    return {
      async get(key: string): Promise<string | undefined> {
        const [provider, brandId] = key.split(':')
        const { rows } = await pg.query<{ cursor: string | null }>(
          `SELECT s.cursor FROM integration.sync_state s
             JOIN integration.integrations i ON i.id = s.integration_id
            WHERE i.brand_id=$1 AND i.provider=$2 LIMIT 1`,
          [brandId, provider],
        )
        return rows[0]?.cursor ?? undefined
      },
      async set(key: string, cursor: string | undefined): Promise<void> {
        const [provider, brandId] = key.split(':')
        const { rows } = await pg.query<{ id: string }>(
          `SELECT id FROM integration.integrations WHERE brand_id=$1 AND provider=$2 LIMIT 1`,
          [brandId, provider],
        )
        if (!rows[0]) return
        const integrationId = rows[0].id
        const upd = await pg.query(
          `UPDATE integration.sync_state SET cursor=$2, last_sync_at=now(), updated_at=now() WHERE integration_id=$1`,
          [integrationId, cursor ?? null],
        )
        if (upd.rowCount === 0) {
          await pg.query(
            `INSERT INTO integration.sync_state(brand_id, integration_id, cursor, last_sync_at) VALUES ($1,$2,$3,now())`,
            [brandId, integrationId, cursor ?? null],
          )
        }
      },
    }
  }

  private async brand(slug: string): Promise<{ id: string }> {
    const { rows } = await this.pg.query<{ id: string }>(`SELECT id FROM platform.brands WHERE slug=$1 LIMIT 1`, [slug])
    if (!rows[0]) throw new BadRequestException('workspace not found')
    return rows[0]
  }
}
