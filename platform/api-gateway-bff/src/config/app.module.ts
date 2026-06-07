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
import { IdentityService } from '../application/identity.service'
import { MailService } from '../application/mail.service'
import { InviteService } from '../application/invite.service'
import { InviteController } from '../api/http/invite.controller'

@Module({
  controllers: [HealthController, BffController, OnboardingController, TrackController, IntegrationsController, WebhooksController, InviteController],
  providers: [
    ...dbProviders,
    vaultProvider,
    eventBusProvider,
    PgSeenStore,
    IdentityService,
    MailService,
    InviteService,
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
