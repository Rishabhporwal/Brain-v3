/** Base class for tenant-isolation failures. All fail closed (deny access). */
export class TenantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/**
 * The principal has no active membership for the requested brand (or the brand does not exist).
 * Surfaces SHOULD render this as 404 — never disclose existence of a brand the caller can't access.
 */
export class NoBrandAccessError extends TenantError {
  constructor(brandSlug: string) {
    super(`no active membership for brand '${brandSlug}'`)
  }
}

/**
 * Layer 3 backstop: a query returned a row whose brand_id is not the active brand. This must never
 * happen when RLS is correctly applied; if it does, it is a P0 cross-tenant leak and we throw rather
 * than return the row.
 */
export class CrossTenantViolationError extends TenantError {
  constructor(expectedBrandId: string, foundBrandId: string) {
    super(`cross-tenant row leak: expected brand_id=${expectedBrandId} but row carried ${foundBrandId}`)
  }
}
