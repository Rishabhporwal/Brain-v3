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

  // Step 1+2 (legacy multi-step; retained for the settings/costs surface)
  @Post('api/onboarding')
  start(@Req() req: { user: AuthUser }, @Body() body: Record<string, string>) {
    return this.svc.start(req.user, body)
  }

  @Get('api/onboarding/in-progress')
  inProgress(@Req() req: { user: AuthUser }) {
    return this.svc.inProgress(req.user)
  }

  @Get('api/workspaces/:slug/onboarding/progress')
  progress(@Param('slug') slug: string) {
    return this.svc.progress(slug)
  }

  // Step 3
  @Post('api/workspaces/:slug/onboarding/costs')
  costs(@Req() req: { user: AuthUser }, @Param('slug') slug: string, @Body() body: Record<string, number>) {
    return this.svc.configureCosts(req.user, slug, body)
  }

  // Step 4
  @Post('api/workspaces/:slug/onboarding/tracking')
  issueTracking(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.issueTracking(req.user, slug)
  }

  @Post('api/workspaces/:slug/onboarding/tracking/verify')
  verifyTracking(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.verifyTracking(req.user, slug)
  }

  // Step 5
  @Post('api/workspaces/:slug/onboarding/integrations/:provider')
  connect(@Req() req: { user: AuthUser }, @Param('slug') slug: string, @Param('provider') provider: string) {
    return this.svc.connectIntegration(req.user, slug, provider)
  }

  // Step 6
  @Get('api/workspaces/:slug/onboarding/validate')
  validate(@Param('slug') slug: string) {
    return this.svc.validate(slug)
  }

  // Step 7
  @Post('api/workspaces/:slug/onboarding/activate')
  activate(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.activate(req.user, slug)
  }
}
