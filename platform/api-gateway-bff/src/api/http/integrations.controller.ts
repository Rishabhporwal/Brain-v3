import { BadRequestException, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { PermissionGuard, PERMISSIONS, RequirePermission } from '@brain/access-control'
import { KeycloakGuard } from '../guards/keycloak.guard'
import { BrandContextGuard } from '../guards/brand-context.guard'
import { ShopifyService } from '../../application/shopify.service'
import { OAuthService } from '../../application/oauth.service'
import { PullService } from '../../application/pull.service'
import { FreshnessService } from '../../application/freshness.service'
import type { AuthUser } from '../../application/bff.service'

// Brand-scoped guard chain: authenticate → resolve+require membership (404 for non-members) → permission.
const BRAND_GUARDS = [KeycloakGuard, BrandContextGuard, PermissionGuard] as const

/**
 * One OAuth surface for every provider. `connect` is guarded (the authenticated wizard asks for the
 * consent URL); `callback` is public — forwarded server-to-server by the web app's callback route and
 * self-authenticated by the provider's signed state (+ HMAC for Shopify). Shopify has provider-specific
 * needs (shop domain, callback HMAC) so it keeps its own service; standard OAuth2 providers share OAuthService.
 */
@Controller()
export class IntegrationsController {
  constructor(
    private readonly shopify: ShopifyService,
    private readonly oauth: OAuthService,
    private readonly pull: PullService,
    private readonly freshness: FreshnessService,
  ) {}

  // Per-stream evidence freshness (integration health: BRD §13 lag visibility; also feeds the
  // recommendation gate). lagMinutes=null means the stream has never landed for this brand.
  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.INTEGRATIONS_READ)
  @Get('api/workspaces/:slug/integrations/freshness')
  integrationFreshness(@Param('slug') slug: string) {
    return this.freshness.forBrand(slug)
  }

  // Trigger a polling-lane sync for a connected ad provider (google/meta). Manual/ops + tested path;
  // a scheduler runs this on an interval in production.
  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.INTEGRATIONS_WRITE)
  @Post('api/workspaces/:slug/integrations/:provider/sync')
  sync(@Param('slug') slug: string, @Param('provider') provider: string) {
    return this.pull.runSync(provider, slug)
  }

  // Lists the brand's integrations (Settings → Integrations).
  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.INTEGRATIONS_READ)
  @Get('api/workspaces/:slug/integrations')
  list(@Param('slug') slug: string) {
    return this.oauth.listForBrand(slug)
  }

  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.INTEGRATIONS_WRITE)
  @Post('api/workspaces/:slug/integrations/:provider/disconnect')
  disconnect(@Param('slug') slug: string, @Param('provider') provider: string) {
    return this.oauth.disconnect(slug, provider)
  }

  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.INTEGRATIONS_WRITE)
  @Get('api/workspaces/:slug/integrations/:provider/connect')
  connect(
    @Req() req: { user: AuthUser },
    @Param('slug') slug: string,
    @Param('provider') provider: string,
    @Query('shop') shop?: string,
    @Query('returnTo') returnTo?: string,
  ) {
    if (provider === 'shopify') return this.shopify.connect(req.user, slug, shop, returnTo)
    if (OAuthService.PROVIDERS.includes(provider as never))
      return this.oauth.connect(req.user, slug, provider, returnTo)
    throw new BadRequestException(`unsupported provider: ${provider}`)
  }

  @Get('api/integrations/:provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query() query: Record<string, string>,
  ): Promise<{ redirectTo: string }> {
    const redirectTo =
      provider === 'shopify' ? await this.shopify.callback(query) : await this.oauth.callback(provider, query)
    return { redirectTo }
  }
}
