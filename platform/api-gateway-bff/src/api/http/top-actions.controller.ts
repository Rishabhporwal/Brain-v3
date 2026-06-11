import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common'
import { PermissionGuard, PERMISSIONS, RequirePermission, type BrandContext } from '@brain/access-control'
import { KeycloakGuard } from '../guards/keycloak.guard'
import { BrandContextGuard } from '../guards/brand-context.guard'
import { TopActionsService } from '../../application/top-actions.service'

const BRAND_GUARDS = [KeycloakGuard, BrandContextGuard, PermissionGuard] as const

/** BRD §11 Home / Command Center: the top three actions, every one gated + decision-logged. */
@Controller()
export class TopActionsController {
  constructor(private readonly topActions: TopActionsService) {}

  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @Get('api/workspaces/:slug/top-actions')
  list(@Req() req: { brandContext: BrandContext }, @Param('slug') slug: string) {
    return this.topActions.forBrand(slug, req.brandContext.brandId)
  }
}
