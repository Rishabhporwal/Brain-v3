// API GUARD — resolves the authenticated principal + tenant (brand) and attaches it to
// the request. The @BrandId() param decorator reads it. Real impl validates the JWT and
// the membership; this is the seam.
import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common'

@Injectable()
export class WorkspaceGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest()
    req.brandId = req.headers['x-brand-id'] // replace with: resolve from slug + verified membership
    return Boolean(req.brandId)
  }
}
export const BrandId = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().brandId,
)
