/** The authenticated operator principal, as extracted from a verified Keycloak access token. */
export interface Principal {
  /** Keycloak subject (stable per identity). */
  sub: string
  email?: string
  name?: string
}

/** Role scope as defined in platform.roles.scope. */
export type RoleScope = 'org' | 'brand'

/**
 * The resolved tenant context for a request: WHO (user) is acting WHERE (brand/org) and as WHAT (role).
 * Produced by resolveBrandContext from an active membership. Carries the workspace isolation key (brandId)
 * that drives RLS (app.current_brand), Kafka partitioning, ClickHouse settings, and log/trace tags.
 */
export interface BrandContext {
  userId: string
  organizationId: string
  brandId: string
  brandSlug: string
  /** platform.roles.name of the membership that granted access (e.g. 'Owner', 'Marketing Manager'). */
  roleName: string
  roleScope: RoleScope
  /** True when access is via an agency membership — actions are tagged as agency actions in the audit log. */
  isAgency: boolean
}
