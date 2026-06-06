/**
 * Feature flags + workspace-role gating. Pure (no next/server) so it's safe in client components.
 * Surfaces are gated by a feature key (enabled unless explicitly false for the workspace) and/or a min role.
 */

export type FeatureKey =
  | 'pnl'
  | 'waterfall'
  | 'products'
  | 'first_product_cascade'
  | 'lifetime_value'
  | 'cohorts'
  | 'customer_lifecycle'
  | 'acquisition'
  | 'timings'
  | 'distributions'
  | 'inventory'
  | 'store_analytics'
  | 'meta_ads'
  | 'google_ads'
  | 'shiprocket'
  | 'logistics'
  | 'rto_analytics'
  | 'cod_prepaid'
  | 'pincode_intelligence'
  | 'email_sms'
  | 'calendar'
  | 'ai'
  | 'ai_insights'
  | 'goals'
  | 'festivals'
  | 'ad_campaigns'

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'ANALYST' | 'VIEWER'

const ROLE_LEVEL: Record<WorkspaceRole, number> = {
  OWNER: 5,
  ADMIN: 4,
  MANAGER: 3,
  ANALYST: 2,
  VIEWER: 1,
}

export function hasRole(userRole: WorkspaceRole | null | undefined, required: WorkspaceRole): boolean {
  if (!userRole) return false
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[required]
}

/** Named permission checks — readable at call sites. */
export const can = {
  viewFounderSalary: (r: WorkspaceRole | null | undefined) => hasRole(r, 'OWNER'),
  manageIntegrations: (r: WorkspaceRole | null | undefined) => hasRole(r, 'ADMIN'),
  changeSettings: (r: WorkspaceRole | null | undefined) => hasRole(r, 'ADMIN'),
  changeAdAccounts: (r: WorkspaceRole | null | undefined) => hasRole(r, 'ADMIN'),
  viewIntegrations: (r: WorkspaceRole | null | undefined) => hasRole(r, 'MANAGER'),
  viewSettings: (r: WorkspaceRole | null | undefined) => hasRole(r, 'ANALYST'),
  performActions: (r: WorkspaceRole | null | undefined) => hasRole(r, 'ANALYST'),
}

/** A feature is enabled unless explicitly set to false in the workspace's feature map. */
export function isFeatureEnabled(
  features: Record<string, boolean> | null | undefined,
  key: FeatureKey,
): boolean {
  if (!features) return true
  return typeof features[key] === 'boolean' ? features[key] : true
}

export function getDisabledFeatures(features: Record<string, boolean> | null | undefined): FeatureKey[] {
  if (!features) return []
  return (Object.entries(features) as [FeatureKey, boolean][])
    .filter(([, enabled]) => enabled === false)
    .map(([key]) => key)
}
