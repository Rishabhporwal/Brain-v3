import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common'
import { KeycloakGuard } from '../guards/keycloak.guard'
import { BffService, type AuthUser } from '../../application/bff.service'

@Controller()
@UseGuards(KeycloakGuard)
export class BffController {
  constructor(private readonly svc: BffService) {}

  @Get('me')
  me(@Req() req: { user: AuthUser }) {
    return this.svc.me(req.user)
  }

  @Get('api/workspaces/:slug/context')
  context(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.context(req.user, slug)
  }

  // Level 2 of the three-level RBAC model: the UI reads this to show/hide controls. NOT a security
  // boundary — every protected route is independently enforced server-side (Level 1).
  @Get('api/workspaces/:slug/permissions')
  permissions(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.permissions(req.user, slug)
  }

  @Get('api/workspaces/:slug/festivals')
  festivals(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.festivals(req.user, slug)
  }

  @Get('api/workspaces/:slug/:surface/summary')
  summary(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.summary(req.user, slug)
  }

  @Get('api/workspaces/:slug/:surface/detail')
  detail(@Req() req: { user: AuthUser }, @Param('slug') slug: string) {
    return this.svc.detail(req.user, slug)
  }
}
