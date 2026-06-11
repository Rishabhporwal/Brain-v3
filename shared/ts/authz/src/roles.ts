import { PERMISSIONS, type PermissionKey } from './permissions'

const P = PERMISSIONS

/**
 * The 11 FIXED, code-seeded roles (no custom roles in v1). Names match platform.roles.name exactly.
 * Org scope: Owner (sole org role). Brand scope: Brand Admin + the domain Manager/Analyst roles + Read Only.
 */
export const ROLES = {
  OWNER: 'Owner',
  BRAND_ADMIN: 'Brand Admin',
  MARKETING_MANAGER: 'Marketing Manager',
  MARKETING_ANALYST: 'Marketing Analyst',
  FINANCE_MANAGER: 'Finance Manager',
  FINANCE_ANALYST: 'Finance Analyst',
  OPERATIONS_MANAGER: 'Operations Manager',
  OPERATIONS_ANALYST: 'Operations Analyst',
  SUPPORT_MANAGER: 'Support Manager',
  SUPPORT_ANALYST: 'Support Analyst',
  READ_ONLY: 'Read Only',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

export const ORG_ROLES: readonly RoleName[] = [ROLES.OWNER]
export const BRAND_ROLES: readonly RoleName[] = [
  ROLES.BRAND_ADMIN,
  ROLES.MARKETING_MANAGER,
  ROLES.MARKETING_ANALYST,
  ROLES.FINANCE_MANAGER,
  ROLES.FINANCE_ANALYST,
  ROLES.OPERATIONS_MANAGER,
  ROLES.OPERATIONS_ANALYST,
  ROLES.SUPPORT_MANAGER,
  ROLES.SUPPORT_ANALYST,
  ROLES.READ_ONLY,
]

const ALL_PERMISSIONS: PermissionKey[] = Object.values(P)

// Common bundles, composed below. Manager roles imply write within their domain; Analyst roles imply
// read (+ comment, enforced at the surface); Read Only is reads minus raw PII; Agency mirrors a brand
// growth role but its actions are audit-tagged as agency (see tenancy BrandContext.isAgency).
const READS_BASE: PermissionKey[] = [P.ANALYTICS_READ, P.ATTRIBUTION_READ, P.ORDERS_READ]

/**
 * CODE-CANONICAL role → permission map. The platform.role_permissions seed is derived from this exact
 * table (see data/stores/postgres/seed/11_rbac_seed.sql). billing.manage / brand.delete / autoexecute
 * are org-Owner powers per BRD §7.3 ("Change billing or delete brand: Owner only").
 */
export const ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  // ── Org scope ──────────────────────────────────────────────────────────────
  [ROLES.OWNER]: ALL_PERMISSIONS,

  // ── Brand scope ────────────────────────────────────────────────────────────
  [ROLES.BRAND_ADMIN]: [
    ...READS_BASE,
    P.ADS_READ,
    P.ADS_WRITE,
    P.COSTS_READ,
    P.COSTS_WRITE,
    P.INTEGRATIONS_READ,
    P.INTEGRATIONS_WRITE,
    P.USERS_MANAGE,
    P.AUTOEXECUTE_MANAGE,
    P.REFUND_EXECUTE,
  ],
  [ROLES.MARKETING_MANAGER]: [...READS_BASE, P.ADS_READ, P.ADS_WRITE, P.INTEGRATIONS_READ, P.COSTS_READ],
  [ROLES.MARKETING_ANALYST]: [...READS_BASE, P.ADS_READ, P.COSTS_READ],
  [ROLES.FINANCE_MANAGER]: [P.ANALYTICS_READ, P.ORDERS_READ, P.COSTS_READ, P.COSTS_WRITE, P.REFUND_EXECUTE],
  [ROLES.FINANCE_ANALYST]: [P.ANALYTICS_READ, P.ORDERS_READ, P.COSTS_READ],
  [ROLES.OPERATIONS_MANAGER]: [P.ANALYTICS_READ, P.ORDERS_READ, P.INTEGRATIONS_READ, P.INTEGRATIONS_WRITE],
  [ROLES.OPERATIONS_ANALYST]: [P.ANALYTICS_READ, P.ORDERS_READ, P.INTEGRATIONS_READ],
  [ROLES.SUPPORT_MANAGER]: [P.ANALYTICS_READ, P.ORDERS_READ, P.REFUND_EXECUTE],
  [ROLES.SUPPORT_ANALYST]: [P.ANALYTICS_READ, P.ORDERS_READ],
  [ROLES.READ_ONLY]: [...READS_BASE],
}

/** True for the org-level roles that carry organization-wide authority. */
export function isOrgRole(role: string): boolean {
  return (ORG_ROLES as readonly string[]).includes(role)
}

/** The role that owns a brand/org and cannot be the last one removed. */
export const OWNER_ROLE: RoleName = ROLES.OWNER
