import { Controller, Headers, Param, Post, RawBodyRequest, Req, Res } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { WebhookService } from '../../application/webhook.service'

/**
 * Inbound provider webhooks (real-time data ingest). Public — authenticated by the provider's HMAC over
 * the RAW body, NOT a session. Generic: `:provider` dispatches to the matching push connector. Account-level
 * providers (Razorpay/Stripe) carry the brand in the path (`/:provider/:brandId`). Verified payloads are
 * published to the Kafka data plane; a downstream consumer normalizes them into ClickHouse.
 */
// SkipThrottle: providers send bursty webhook fan-out (e.g. sale-day order storms); HMAC auth + dedup are
// the controls here, not a per-IP cap that would drop legitimate provider deliveries.
@SkipThrottle()
@Controller()
export class WebhooksController {
  constructor(private readonly webhooks: WebhookService) {}

  @Post('api/webhooks/:provider')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string | undefined>,
  ): Promise<void> {
    await this.dispatch(req, res, provider, headers)
  }

  // Account-level providers (no store/shop in the body) → brand from the path.
  @Post('api/webhooks/:provider/:brandId')
  async webhookForBrand(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Param('provider') provider: string,
    @Param('brandId') brandId: string,
    @Headers() headers: Record<string, string | undefined>,
  ): Promise<void> {
    await this.dispatch(req, res, provider, headers, brandId)
  }

  private async dispatch(req: RawBodyRequest<Request>, res: Response, provider: string, headers: Record<string, string | undefined>, brandId?: string): Promise<void> {
    const rawBody = req.rawBody ?? Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}))
    const { status } = await this.webhooks.handle(provider, { rawBody, headers }, brandId)
    res.status(status).json({ ok: status < 300 })
  }
}
