import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import { KeycloakGuard } from './keycloak.guard'
import { ShopifyService } from './shopify.service'
import { OAuthService } from './oauth.service'
import type { AuthUser } from './bff.service'

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
  ) {}

  // Lists the brand's integrations (Settings → Integrations).
  @UseGuards(KeycloakGuard)
  @Get('api/workspaces/:slug/integrations')
  list(@Param('slug') slug: string) {
    return this.oauth.listForBrand(slug)
  }

  @UseGuards(KeycloakGuard)
  @Get('api/workspaces/:slug/integrations/:provider/connect')
  connect(
    @Req() req: { user: AuthUser },
    @Param('slug') slug: string,
    @Param('provider') provider: string,
    @Query('shop') shop?: string,
    @Query('returnTo') returnTo?: string,
  ) {
    if (provider === 'shopify') return this.shopify.connect(req.user, slug, shop, returnTo)
    if (OAuthService.PROVIDERS.includes(provider as never)) return this.oauth.connect(req.user, slug, provider, returnTo)
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
