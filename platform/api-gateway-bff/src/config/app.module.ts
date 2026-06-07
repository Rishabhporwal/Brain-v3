import { Module } from '@nestjs/common'
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
import { WebhookService } from '../application/webhook.service'

@Module({
  controllers: [HealthController, BffController, OnboardingController, TrackController, IntegrationsController, WebhooksController],
  providers: [
    ...dbProviders,
    vaultProvider,
    eventBusProvider,
    PgSeenStore,
    BffService,
    OnboardingService,
    TrackService,
    ShopifyService,
    OAuthService,
    PullService,
    WebhookService,
  ],
})
export class AppModule {}
