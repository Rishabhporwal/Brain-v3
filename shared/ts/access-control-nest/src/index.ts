/**
 * @brain/access-control-nest — the NestJS adoption layer for @brain/access-control.
 *
 * A service adopts the full tenant-isolation + RBAC seam with one import:
 *   import { AccessControlModule, BrandContextGuard, PermissionGuard, RequirePermission, PERMISSIONS } from '@brain/access-control-nest'
 *   @Module({ imports: [AccessControlModule.forRoot()] })
 */
export { AccessControlModule, type AccessControlModuleOptions } from './module'
export { PG_POOL } from './tokens'
export { IdentityService, emailHash } from './identity.service'
export { BrandContextGuard } from './brand-context.guard'
export { AccessControlExceptionFilter } from './access-control.filter'

// Re-export the framework-agnostic core so consumers need only this one package.
export * from '@brain/access-control'
