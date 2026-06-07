import type { Pool, PoolClient } from 'pg'
import { CrossTenantViolationError } from './errors'

/**
 * The non-superuser Postgres role that RLS policies apply to. The app's connection role is typically the
 * DB owner/superuser (which BYPASSES RLS), so every tenant query runs `SET LOCAL ROLE <app role>` inside a
 * transaction to drop into a role that IS subject to RLS. SET LOCAL reverts on COMMIT/ROLLBACK.
 *
 * Production note: prefer connecting as a dedicated non-superuser login role outright; SET LOCAL ROLE is
 * the local/dev-safe equivalent that needs no PG_URL change. See ACCESS_CONTROL.md.
 */
const APP_ROLE = process.env.PG_APP_ROLE ?? 'brain_app'
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/

function appRole(): string {
  if (!SAFE_IDENT.test(APP_ROLE)) throw new Error(`unsafe PG_APP_ROLE: ${APP_ROLE}`)
  return APP_ROLE
}

/**
 * Layer 1 — run `fn` inside a transaction with RLS ACTIVE for the active brand. Use for ALL tenant-data
 * access (orders, customers, brand-scoped reads/writes). Sets, transaction-locally:
 *   SET LOCAL ROLE brain_app;                 -- a role RLS applies to
 *   set_config('app.current_brand', brandId)  -- the policy's USING/WITH CHECK key
 *   set_config('app.current_org',   orgId)    -- for org-scoped policies
 * Because the GUC is unset OUTSIDE this wrapper, `current_setting('app.current_brand', true)` is NULL and
 * every RLS policy evaluates to false → fail closed. The same connection is reused for nested queries.
 */
export async function withBrandContext<T>(
  pool: Pool,
  ctx: { brandId: string; organizationId?: string },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL ROLE ${appRole()}`)
    // set_config(..., true) === SET LOCAL; parameterized so values can never be injected.
    await client.query(`SELECT set_config('app.current_brand', $1, true)`, [ctx.brandId])
    if (ctx.organizationId) await client.query(`SELECT set_config('app.current_org', $1, true)`, [ctx.organizationId])
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* connection already broken; release below */
    }
    throw err
  } finally {
    client.release()
  }
}

/**
 * Control-plane access — cross-brand identity/membership lookups that RESOLVE tenant context and therefore
 * cannot themselves be brand-RLS-bound (e.g. "list all brands this user belongs to"). Runs as the
 * privileged connection role with NO brand GUC set. Callers MUST scope every query explicitly by user_id.
 * Never use this for tenant data.
 */
export async function withControlPlane<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

/**
 * Layer 3 — assert that every returned row belongs to the active brand. A defensive backstop for queries
 * that project brand_id; throws CrossTenantViolationError on any mismatch rather than leaking the row.
 */
export function assertBrandOwnership<T extends { brand_id?: string | null }>(rows: T[], brandId: string): T[] {
  for (const row of rows) {
    if (row.brand_id != null && row.brand_id !== brandId) {
      throw new CrossTenantViolationError(brandId, row.brand_id)
    }
  }
  return rows
}
