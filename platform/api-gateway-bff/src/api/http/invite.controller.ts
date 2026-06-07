import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { PERMISSIONS, PermissionGuard, RequirePermission, type BrandContext } from '@brain/access-control'
import { KeycloakGuard } from '../guards/keycloak.guard'
import { BrandContextGuard } from '../guards/brand-context.guard'
import { InviteService } from '../../application/invite.service'
import type { AuthUser } from '../../application/bff.service'

const BRAND_GUARDS = [KeycloakGuard, BrandContextGuard, PermissionGuard] as const
const WEB_BASE = process.env.WEB_BASE ?? 'http://localhost:8088'

/** Invite-only user lifecycle. All brand ops require users.manage; accept only requires authentication. */
@Controller()
export class InviteController {
  constructor(private readonly svc: InviteService) {}

  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  @Post('api/workspaces/:slug/invites')
  invite(@Req() req: { brandContext: BrandContext }, @Body() body: { email: string; role: string }) {
    return this.svc.invite(req.brandContext, body?.email, body?.role, WEB_BASE)
  }

  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  @Get('api/workspaces/:slug/members')
  members(@Req() req: { brandContext: BrandContext }) {
    return this.svc.listMembers(req.brandContext)
  }

  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  @Post('api/workspaces/:slug/invites/:membershipId/resend')
  resend(@Req() req: { brandContext: BrandContext }, @Param('membershipId') membershipId: string) {
    return this.svc.resend(req.brandContext, membershipId, WEB_BASE)
  }

  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  @Post('api/workspaces/:slug/invites/:membershipId/revoke')
  revoke(@Req() req: { brandContext: BrandContext }, @Param('membershipId') membershipId: string) {
    return this.svc.revoke(req.brandContext, membershipId)
  }

  // Accept: the invitee is authenticated (any signed-in user); the token proves the invitation. No :slug,
  // so no BrandContextGuard — the membership being activated is derived from the token's user.
  @UseGuards(KeycloakGuard)
  @Post('api/invites/accept')
  accept(@Req() req: { user: AuthUser }, @Body() body: { token: string }) {
    return this.svc.accept(req.user, body?.token)
  }
}
