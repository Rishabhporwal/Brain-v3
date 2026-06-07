/**
 * @brain/access-control — the AccessControl abstraction (the seam the DoD requires).
 *
 * Re-exports the composed surface so a service imports ONE package:
 *   import { AccessControl, RequirePermission, PERMISSIONS, withBrandContext } from '@brain/access-control'
 *
 * Layering: tenancy = isolation (Layers 1–3), authz = RBAC, this = the facade. See ACCESS_CONTROL.md.
 */
export { AccessControl, PermissionDeniedError } from './access-control'

// Tenant isolation (Layers 1–3)
export {
  type Principal,
  type BrandContext,
  type RoleScope,
  TenantError,
  NoBrandAccessError,
  CrossTenantViolationError,
  withBrandContext,
  withControlPlane,
  assertBrandOwnership,
  resolveBrandContext,
} from '@brain/tenancy'

// Fixed-role RBAC
export {
  REGISTRY_VERSION,
  PERMISSIONS,
  PERMISSION_REGISTRY,
  isPermission,
  type PermissionKey,
  type PermissionLevel,
  type PermissionDef,
  ROLES,
  ORG_ROLES,
  BRAND_ROLES,
  ROLE_PERMISSIONS,
  OWNER_ROLE,
  isOrgRole,
  type RoleName,
  permissionsForRole,
  roleHasPermission,
  buildMePermissions,
  type MePermissions,
  RequirePermission,
  PermissionGuard,
  PERMISSION_METADATA_KEY,
  assertNotLastOwner,
  LastOwnerError,
} from '@brain/authz'
