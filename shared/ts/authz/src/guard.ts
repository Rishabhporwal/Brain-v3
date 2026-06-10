import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { roleHasPermission } from './resolve'
import type { PermissionKey } from './permissions'

export const PERMISSION_METADATA_KEY = 'brain:required-permission'

/**
 * Route decorator declaring the permission required to invoke a handler. Enforced by PermissionGuard.
 *   @RequirePermission(PERMISSIONS.COSTS_WRITE)
 */
export const RequirePermission = (permission: PermissionKey) => SetMetadata(PERMISSION_METADATA_KEY, permission)

/**
 * API-layer RBAC enforcement (Level 1 of the three-level model). Reads the required permission from route
 * metadata and the caller's role from req.brandContext (set by the AccessControl resolver, which runs
 * after the auth guard). Fails CLOSED: no context, unknown role, or missing permission → 403.
 *
 * Register globally (APP_GUARD) AFTER auth + context resolution, or per-controller.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey | undefined>(PERMISSION_METADATA_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!required) return true // route declares no permission requirement

    const req = ctx.switchToHttp().getRequest<{ brandContext?: { roleName?: string } }>()
    const role = req.brandContext?.roleName
    if (!role) throw new ForbiddenException('no tenant context for permission check')
    if (!roleHasPermission(role, required)) throw new ForbiddenException(`missing permission: ${required}`)
    return true
  }
}
