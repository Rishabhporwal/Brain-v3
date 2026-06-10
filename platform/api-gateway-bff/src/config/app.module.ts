import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AccessControlModule } from '@brain/access-control-nest'
import { MetricsController } from '../api/metrics.controller'
import { MetricsInterceptor } from '../api/metrics.interceptor'
import { dbProviders } from '../persistence/db.providers'
import { BffService } from '../application/bff.service'
import { BffController } from '../api/http/bff.controller'
import { HealthController } from '../api/http/health.controller'
import { OnboardingService } from '../application/onboarding.service'
import { OnboardingController } from '../api/http/onboarding.controller'
import { TrackService } from '../application/track.service'
import { TrackController } from '../api/http/track.controller'
import { ShopifyService } from '../application/shopify.service'
import { OAuthService } from '../application/oauth.service'
import { IntegrationsController } from '../api/http/integrations.controller'
import { WebhooksController } from '../api/http/webhooks.controller'
import { vaultProvider } from '../infrastructure/secrets/vault'
import { eventBusProvider } from '../infrastructure/messaging/events'
import { PgSeenStore } from '../persistence/seen-store'
import { PullService } from '../application/pull.service'
import { SyncSchedulerService } from '../application/sync-scheduler.service'
import { WebhookService } from '../application/webhook.service'
import { FreshnessService } from '../application/freshness.service'
import { RecommendationGateService } from '../application/recommendation-gate.service'
import { McpService } from '../application/mcp.service'
import { McpController } from '../api/http/mcp.controller'
import { MailService } from '../application/mail.service'
import { InviteService } from '../application/invite.service'
import { InviteController } from '../api/http/invite.controller'

@Module({
  // AccessControlModule provides (globally): PG_POOL, AccessControl, IdentityService, BrandContextGuard,
  // PermissionGuard, and the fail-closed exception filter — the one-import access-control seam.
  // ThrottlerModule: a baseline per-IP DoS backstop (audit: BFF had no rate limiting). Generous global
  // default; tighten per-route later (stricter on auth/refund, looser/exempt on /track + webhooks).
  imports: [
    AccessControlModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MIN ?? 600) }]),
    // Drives the polling-lane scheduler (SyncSchedulerService) — automatic Google/Meta ad-spend sync.
    ScheduleModule.forRoot(),
  ],
  controllers: [HealthController, BffController, OnboardingController, TrackController, IntegrationsController, WebhooksController, InviteController, McpController, MetricsController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    ...dbProviders,
    vaultProvider,
    eventBusProvider,
    PgSeenStore,
    MailService,
    InviteService,
    BffService,
    OnboardingService,
    TrackService,
    ShopifyService,
    OAuthService,
    PullService,
    SyncSchedulerService,
    WebhookService,
    FreshnessService,
    RecommendationGateService,
    McpService,
  ],
})
export class AppModule {}
