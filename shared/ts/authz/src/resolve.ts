import { ROLE_PERMISSIONS, type RoleName } from './roles'
import { REGISTRY_VERSION, type PermissionKey } from './permissions'

/** Permissions granted by a role. Unknown role → [] (fail closed). */
export function permissionsForRole(role: string): PermissionKey[] {
  return ROLE_PERMISSIONS[role as RoleName] ?? []
}

/** Whether a role grants a specific permission. Fail closed for unknown role/permission. */
export function roleHasPermission(role: string, permission: string): boolean {
  return permissionsForRole(role).includes(permission as PermissionKey)
}

export interface MePermissions {
  /** Permission-registry version the client should treat these against. */
  version: number
  role: string
  permissions: PermissionKey[]
}

/**
 * Payload for the frontend /me/permissions endpoint. The UI uses this to hide/disable controls, but it is
 * NOT security — every protected route is independently enforced server-side by the PermissionGuard.
 */
export function buildMePermissions(role: string): MePermissions {
  return { version: REGISTRY_VERSION, role, permissions: permissionsForRole(role) }
}
