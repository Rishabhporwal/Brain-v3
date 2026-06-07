import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { KeycloakGuard } from './keycloak.guard'
import { OnboardingService } from './onboarding.service'
import type { AuthUser } from './bff.service'

@Controller()
@UseGuards(KeycloakGuard)
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  // Single-shot onboarding (legacy-style): profile → brand → platform → connect → launch.
  @Post('api/onboarding/complete')
  complete(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.svc.complete(req.user, body)
  }

  // Settings → Costs
  @Get('api/workspaces/:slug/costs')
  getCosts(@Param('slug') slug: string) {
    return this.svc.getCosts(slug)
  }

  @Post('api/workspaces/:slug/costs')
  costs(@Req() req: { user: AuthUser }, @Param('slug') slug: string, @Body() body: Record<string, number>) {
    return this.svc.configureCosts(req.user, slug, body)
  }

  // Settings → Tracking
  @Post('api/workspaces/:slug/tracking')
  issueTracking(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.issueTracking(req.user, slug)
  }

  @Post('api/workspaces/:slug/tracking/verify')
  verifyTracking(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.verifyTracking(req.user, slug)
  }
}
