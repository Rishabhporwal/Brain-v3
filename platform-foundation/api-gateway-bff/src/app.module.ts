import { Module } from '@nestjs/common'
import { dbProviders } from './db.providers'
import { BffService } from './bff.service'
import { BffController } from './bff.controller'
import { HealthController } from './health.controller'
import { OnboardingService } from './onboarding.service'
import { OnboardingController } from './onboarding.controller'
import { TrackService } from './track.service'
import { TrackController } from './track.controller'
import { ShopifyService } from './shopify.service'
import { OAuthService } from './oauth.service'
import { IntegrationsController } from './integrations.controller'
import { WebhooksController } from './webhooks.controller'
import { vaultProvider } from './vault'
import { eventBusProvider } from './events'
import { PgSeenStore } from './seen-store'
import { PullService } from './pull.service'

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
  ],
})
export class AppModule {}
