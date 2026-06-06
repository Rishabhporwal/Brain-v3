import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common'
import { KeycloakGuard } from './keycloak.guard'
import { BffService, type AuthUser } from './bff.service'

@Controller()
@UseGuards(KeycloakGuard)
export class BffController {
  constructor(private readonly svc: BffService) {}

  @Get('me')
  me(@Req() req: { user: AuthUser }) {
    return this.svc.me(req.user)
  }

  @Get('api/workspaces/:slug/context')
  context(@Param('slug') slug: string) {
    return this.svc.context(slug)
  }

  @Get('api/workspaces/:slug/:surface/summary')
  summary(@Param('slug') slug: string) {
    return this.svc.summary(slug)
  }

  @Get('api/workspaces/:slug/:surface/detail')
  detail(@Param('slug') slug: string) {
    return this.svc.detail(slug)
  }
}
