import { Inject, Injectable, Logger } from '@nestjs/common'
import { Pool } from 'pg'
import type { ConnectorHooks, WebhookContext } from '@brain/connector-kit'
import { shopify } from '@brain/connector-shopify'
import { woocommerce } from '@brain/connector-woocommerce'
import { razorpay } from '@brain/connector-razorpay'
import { PG_POOL } from './db.providers'
import { EVENT_BUS, type EventBus } from './events'
import { PgSeenStore } from './seen-store'

/** Push connectors, keyed by provider. Adding a webhook provider = drop its hooks object in here. */
const PUSH_CONNECTORS: Record<string, ConnectorHooks> = { shopify, woocommerce, razorpay }

/**
 * Generic inbound-webhook receiver (P4). Drives ANY push connector through the contract hooks:
 * resolve brand + secret (provider-specific) → verify signature → dedup → map → publish normalized records
 * to the Kafka data plane → handle control (uninstall/GDPR). The provider details live in the connector;
 * this service is the vendor-agnostic glue.
 */
@Injectable()
export class WebhookService {
  private readonly log = new Logger(WebhookService.name)

  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly seen: PgSeenStore,
  ) {}

  async handle(provider: string, ctx: WebhookContext, brandIdPath?: string): Promise<{ status: number }> {
    const connector = PUSH_CONNECTORS[provider]
    if (!connector || !connector.mapWebhook) return { status: 404 }

    const resolved = await this.resolve(provider, ctx, brandIdPath)
    if (connector.verifyWebhook && !connector.verifyWebhook(ctx, resolved.secret)) return { status: 401 }

    // Idempotency — dedup on the provider's delivery/event id.
    const idHeader = connector.webhookIdHeader
    const wid = idHeader ? ctx.headers[idHeader] : undefined
    if (wid && (await this.seen.seen(`${provider}:${wid}`, resolved.brandId))) return { status: 200 }

    const mapped = connector.mapWebhook(ctx)
    if (mapped.control === 'uninstall') {
      if (resolved.brandId) {
        await this.pg.query(`UPDATE integration.integrations SET status='disconnected' WHERE brand_id=$1 AND provider=$2`, [resolved.brandId, provider])
      }
      return { status: 200 }
    }
    if (mapped.control === 'gdpr') return { status: 200 }

    if (!resolved.brandId) return { status: 202 } // accepted, no brand mapped yet
    for (const rec of mapped.records) {
      this.bus.emitWebhook({ provider, topic: mapped.topic, stream: rec.stream, brandId: resolved.brandId, shop: mapped.shop, payload: rec.data })
    }
    return { status: 200 }
  }

  // Provider-specific brand resolution + signing secret. Shopify/Woo resolve by store; Razorpay/Stripe by path.
  private async resolve(provider: string, ctx: WebhookContext, brandIdPath?: string): Promise<{ brandId: string | null; secret: string }> {
    if (provider === 'shopify') {
      const shop = (ctx.headers['x-shopify-shop-domain'] ?? '').toLowerCase().replace(/^https?:\/\//, '').split('/')[0]
      return { brandId: await this.brandByStore(shop), secret: process.env.SHOPIFY_CLIENT_SECRET ?? 'dev' }
    }
    if (provider === 'woocommerce') {
      const source = (ctx.headers['x-wc-webhook-source'] ?? '').replace(/\/+$/, '')
      return { brandId: await this.brandByStore(source), secret: process.env.WOOCOMMERCE_WEBHOOK_SECRET ?? 'dev' }
    }
    if (provider === 'razorpay') {
      return { brandId: brandIdPath ?? null, secret: process.env.RAZORPAY_WEBHOOK_SECRET ?? 'dev' }
    }
    return { brandId: brandIdPath ?? null, secret: 'dev' }
  }

  private async brandByStore(store: string): Promise<string | null> {
    if (!store) return null
    const { rows } = await this.pg.query<{ id: string }>(
      `SELECT id FROM platform.brands WHERE store_url=$1 ORDER BY created_at DESC LIMIT 1`,
      [store],
    )
    return rows[0]?.id ?? null
  }
}
