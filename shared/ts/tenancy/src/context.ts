import type { Pool } from 'pg'
import type { BrandContext, RoleScope } from './types'
import { withControlPlane } from './rls'

interface ContextRow {
  organization_id: string
  brand_id: string
  brand_slug: string
  role_name: string
  role_scope: RoleScope
  is_agency: boolean
}

/**
 * Resolve the active BrandContext for a user + brand slug from their memberships. Control-plane query
 * (cross-brand by nature), explicitly scoped to user_id. Access is granted by EITHER:
 *   • a brand-scoped membership for that exact brand, OR
 *   • an org-scoped membership (brand_id IS NULL) on the org that owns the brand — so an org Owner/Admin
 *     reaches every brand in their organization without a per-brand row.
 * A brand-specific membership is preferred when both exist. Returns null when the user has no active
 * membership reaching the brand (caller renders 404 — never disclose the brand).
 */
export async function resolveBrandContext(pool: Pool, userId: string, brandSlug: string): Promise<BrandContext | null> {
  return withControlPlane(pool, async (client) => {
    const { rows } = await client.query<ContextRow>(
      `SELECT b.organization_id, b.id AS brand_id, b.slug AS brand_slug,
              r.name AS role_name, r.scope AS role_scope, m.is_agency
         FROM platform.brands b
         JOIN platform.memberships m
           ON m.state = 'active'
          AND m.user_id = $1
          AND (m.brand_id = b.id OR (m.brand_id IS NULL AND m.organization_id = b.organization_id))
         JOIN platform.roles r ON r.id = m.role_id
        WHERE b.slug = $2
        ORDER BY (m.brand_id = b.id) DESC  -- prefer the brand-specific membership over an org-wide one
        LIMIT 1`,
      [userId, brandSlug],
    )
    const row = rows[0]
    if (!row) return null
    return {
      userId,
      organizationId: row.organization_id,
      brandId: row.brand_id,
      brandSlug: row.brand_slug,
      roleName: row.role_name,
      roleScope: row.role_scope,
      isAgency: row.is_agency,
    }
  })
}
