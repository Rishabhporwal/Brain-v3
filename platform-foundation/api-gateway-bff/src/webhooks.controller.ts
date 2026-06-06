import { Controller, Headers, Post, RawBodyRequest, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { ShopifyService } from './shopify.service'

/**
 * Inbound provider webhooks (real-time data ingest). Public — authenticated by the provider's HMAC over
 * the RAW body, NOT a session. Verified payloads are published to the Kafka data plane; a downstream
 * consumer normalizes them into ClickHouse. Replies fast so the provider doesn't retry.
 */
@Controller()
export class WebhooksController {
  constructor(private readonly shopify: ShopifyService) {}

  @Post('api/webhooks/shopify')
  async shopifyWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('x-shopify-shop-domain') shop?: string,
    @Headers('x-shopify-topic') topic?: string,
    @Headers('x-shopify-hmac-sha256') hmac?: string,
  ): Promise<void> {
    const rawBody = req.rawBody ?? Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}))
    const { status } = await this.shopify.handleWebhook({ shop, topic, hmac, rawBody })
    res.status(status).json({ ok: status < 300 })
  }
}
