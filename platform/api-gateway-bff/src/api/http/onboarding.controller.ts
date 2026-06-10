import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { PERMISSIONS, PermissionGuard, RequirePermission } from '@brain/access-control'
import { KeycloakGuard } from '../guards/keycloak.guard'
import { BrandContextGuard } from '../guards/brand-context.guard'
import { OnboardingService } from '../../application/onboarding.service'
import type { AuthUser } from '../../application/bff.service'

// BrandContextGuard is a no-op for slug-less routes (e.g. /complete, the registration path), and enforces
// membership for every :slug route. PermissionGuard is a no-op unless the handler declares @RequirePermission.
@Controller()
@UseGuards(KeycloakGuard, BrandContextGuard, PermissionGuard)
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  // Single-shot onboarding (legacy-style): profile → brand → platform → connect → launch.
  // No brand context yet (it's being created) → no permission gate; the caller becomes the brand Owner.
  @Post('api/onboarding/complete')
  complete(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.svc.complete(req.user, body)
  }

  // Settings → Costs
  @Get('api/workspaces/:slug/costs')
  @RequirePermission(PERMISSIONS.COSTS_READ)
  getCosts(@Param('slug') slug: string) {
    return this.svc.getCosts(slug)
  }

  @Post('api/workspaces/:slug/costs')
  @RequirePermission(PERMISSIONS.COSTS_WRITE)
  costs(@Req() req: { user: AuthUser }, @Param('slug') slug: string, @Body() body: Record<string, number>) {
    return this.svc.configureCosts(req.user, slug, body)
  }

  // Settings → Tracking (SDK write-key issuance + verification = an integration-config action)
  @Post('api/workspaces/:slug/tracking')
  @RequirePermission(PERMISSIONS.INTEGRATIONS_WRITE)
  issueTracking(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.issueTracking(req.user, slug)
  }

  @Post('api/workspaces/:slug/tracking/verify')
  @RequirePermission(PERMISSIONS.INTEGRATIONS_WRITE)
  verifyTracking(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.verifyTracking(req.user, slug)
  }
}
