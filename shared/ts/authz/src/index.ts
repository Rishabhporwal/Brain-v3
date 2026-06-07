/**
 * @brain/authz — fixed-role RBAC. The permission registry is the code-canonical vocabulary; ROLE_PERMISSIONS
 * is the canonical role→permission map (the platform.role_permissions seed is derived from it). Enforcement
 * is server-side via PermissionGuard + @RequirePermission; /me/permissions feeds the UI (visibility only).
 */
export {
  REGISTRY_VERSION,
  PERMISSIONS,
  PERMISSION_REGISTRY,
  isPermission,
  type PermissionKey,
  type PermissionLevel,
  type PermissionDef,
} from './permissions'
export {
  ROLES,
  ORG_ROLES,
  BRAND_ROLES,
  ROLE_PERMISSIONS,
  OWNER_ROLE,
  isOrgRole,
  type RoleName,
} from './roles'
export { permissionsForRole, roleHasPermission, buildMePermissions, type MePermissions } from './resolve'
export { RequirePermission, PermissionGuard, PERMISSION_METADATA_KEY } from './guard'
export { assertNotLastOwner, LastOwnerError } from './last-owner'
