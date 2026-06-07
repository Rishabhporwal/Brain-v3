/**
 * @brain/tenancy — the structural tenant-isolation seam.
 *
 * Layer 1 (app guard): withBrandContext runs tenant queries under `SET LOCAL ROLE brain_app` +
 *   app.current_brand, so Postgres RLS (Layer 2, defined in the SQL schema) actually enforces.
 * Layer 3 (runtime validation): assertBrandOwnership rejects any row that escaped the active brand.
 * Control-plane: withControlPlane + resolveBrandContext for cross-brand identity/membership lookups.
 */
export type { Principal, BrandContext, RoleScope } from './types'
export { TenantError, NoBrandAccessError, CrossTenantViolationError } from './errors'
export { withBrandContext, withControlPlane, assertBrandOwnership } from './rls'
export { resolveBrandContext } from './context'
