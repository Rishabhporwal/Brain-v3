/**
 * The versioned permission registry. Permissions are feature/action keys (NOT roles) and are the single
 * vocabulary every guard checks against. This module is the CODE-CANONICAL source of truth; the
 * platform.permissions table + role_permissions seed are derived from it (kept in sync by seed SQL).
 *
 * Bump REGISTRY_VERSION on any additive change; permissions are additive-only (never repurpose a key).
 */
export const REGISTRY_VERSION = 1

/** Granularity, mirrored from platform.permissions.level. */
export type PermissionLevel = 'brand' | 'feature' | 'api'

export interface PermissionDef {
  key: string
  level: PermissionLevel
  description: string
}

/** Canonical permission keys. Matches the seeded platform.permissions keys exactly. */
export const PERMISSIONS = {
  ANALYTICS_READ: 'analytics.read',
  ATTRIBUTION_READ: 'attribution.read',
  ORDERS_READ: 'orders.read',
  ADS_READ: 'ads.read',
  ADS_WRITE: 'ads.write',
  COSTS_READ: 'costs.read',
  COSTS_WRITE: 'costs.write',
  INTEGRATIONS_READ: 'integrations.read',
  INTEGRATIONS_WRITE: 'integrations.write',
  USERS_MANAGE: 'users.manage',
  BILLING_MANAGE: 'billing.manage',
  REFUND_EXECUTE: 'refund.execute',
  AUTOEXECUTE_MANAGE: 'autoexecute.manage',
  BRAND_DELETE: 'brand.delete',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const PERMISSION_REGISTRY: readonly PermissionDef[] = [
  { key: PERMISSIONS.ANALYTICS_READ, level: 'feature', description: 'View foundational dashboards and analytics.' },
  { key: PERMISSIONS.ATTRIBUTION_READ, level: 'feature', description: 'View attribution breakdowns.' },
  { key: PERMISSIONS.ORDERS_READ, level: 'feature', description: 'View orders and commerce facts.' },
  { key: PERMISSIONS.ADS_READ, level: 'feature', description: 'View ad spend and campaign metrics.' },
  { key: PERMISSIONS.ADS_WRITE, level: 'feature', description: 'Create/modify ad actions (budget, pause).' },
  { key: PERMISSIONS.COSTS_READ, level: 'feature', description: 'View cost configuration.' },
  { key: PERMISSIONS.COSTS_WRITE, level: 'feature', description: 'Edit cost configuration (COGS, fees).' },
  { key: PERMISSIONS.INTEGRATIONS_READ, level: 'feature', description: 'View connectors and health.' },
  { key: PERMISSIONS.INTEGRATIONS_WRITE, level: 'feature', description: 'Connect/disconnect/sync integrations.' },
  { key: PERMISSIONS.USERS_MANAGE, level: 'feature', description: 'Invite/manage members and role assignments.' },
  { key: PERMISSIONS.BILLING_MANAGE, level: 'feature', description: 'Manage organization billing (org-only).' },
  { key: PERMISSIONS.REFUND_EXECUTE, level: 'api', description: 'Execute a refund (money-moving; cap-gated).' },
  {
    key: PERMISSIONS.AUTOEXECUTE_MANAGE,
    level: 'feature',
    description: 'Configure auto-execute settings (org/owner).',
  },
  { key: PERMISSIONS.BRAND_DELETE, level: 'api', description: 'Delete a brand (org-only; irreversible).' },
]

const VALID_KEYS = new Set<string>(PERMISSION_REGISTRY.map((p) => p.key))

/** True if `key` is a registered permission. Guards fail closed on unknown keys. */
export function isPermission(key: string): key is PermissionKey {
  return VALID_KEYS.has(key)
}
