import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AccessControl, type BrandContext } from '@brain/access-control'
import { IdentityService } from '../../application/identity.service'

/**
 * Resolves the caller's BrandContext for any route carrying a :slug param and attaches it to the request
 * (req.brandContext), enforcing membership uniformly at the API edge. Runs AFTER KeycloakGuard. A
 * non-member triggers NoBrandAccessError → 404 (via AccessControlExceptionFilter), so no brand-scoped
 * handler ever executes for a caller who isn't a member. PermissionGuard then reads req.brandContext.
 */
@Injectable()
export class BrandContextGuard implements CanActivate {
  constructor(
    private readonly ac: AccessControl,
    private readonly identity: IdentityService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{
      params?: { slug?: string }
      user?: { sub: string; email?: string }
      brandContext?: BrandContext
    }>()
    const slug = req.params?.slug
    if (!slug) return true // not a brand-scoped route
    if (!req.user?.sub) throw new UnauthorizedException('missing principal')
    const userId = await this.identity.userIdForSub(req.user.sub, req.user.email)
    req.brandContext = await this.ac.contextFor(userId, slug) // throws NoBrandAccessError → 404
    return true
  }
}
