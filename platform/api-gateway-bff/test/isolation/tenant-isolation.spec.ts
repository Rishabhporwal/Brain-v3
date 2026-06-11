import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import {
  AccessControl,
  CrossTenantViolationError,
  assertBrandOwnership,
  resolveBrandContext,
  withBrandContext,
  withControlPlane,
} from '@brain/access-control'

/**
 * Layer 4 — release-blocking tenant-isolation tests. Proves cross-brand access fails CLOSED at the
 * database (Postgres RLS, enforced via withBrandContext's SET LOCAL ROLE brain_app + app.current_brand).
 * Opt-in via RUN_DB_TESTS=1 against the local stack (CI e2e job has it); skipped on a bare checkout.
 *
 * Fixtures: two independent tenants — org A → brand A → user A (Owner), org B → brand B → user B (Owner).
 * Tenant table under test: platform.teams (standard brand RLS: USING + WITH CHECK; brain_app has full DML).
 */
const RUN = process.env.RUN_DB_TESTS === '1'
const SFX = `iso${Date.now()}${process.pid}`

describe.skipIf(!RUN)('four-layer tenant isolation (fail closed)', () => {
  let pg: Pool
  let ac: AccessControl
  const A = { slug: `${SFX}a`, orgId: '', brandId: '', userId: '' }
  const B = { slug: `${SFX}b`, orgId: '', brandId: '', userId: '' }

  beforeAll(async () => {
    pg = new Pool({ connectionString: process.env.PG_URL ?? 'postgres://brain:brain@localhost:5440/brain' })
    ac = new AccessControl(pg)
    // Seed both tenants as superuser (control-plane bypasses RLS — provisioning path).
    await withControlPlane(pg, async (c) => {
      const ownerRole = (
        await c.query<{ id: string }>(`SELECT id FROM platform.roles WHERE scope='org' AND name='Owner'`)
      ).rows[0].id
      for (const T of [A, B]) {
        T.orgId = (
          await c.query<{ id: string }>(
            `INSERT INTO platform.organizations(name,region,currency,timezone,billing_basis)
           VALUES ($1,'IN','INR','Asia/Kolkata','gmv_percent') RETURNING id`,
            [`Org ${T.slug}`],
          )
        ).rows[0].id
        T.brandId = (
          await c.query<{ id: string }>(
            `INSERT INTO platform.brands(organization_id,name,slug,region,currency,timezone,status)
           VALUES ($1,$2,$3,'IN','INR','Asia/Kolkata','active') RETURNING id`,
            [T.orgId, `Brand ${T.slug}`, T.slug],
          )
        ).rows[0].id
        T.userId = (
          await c.query<{ id: string }>(
            `INSERT INTO platform.users(email_hash,display_name) VALUES ($1,$2) RETURNING id`,
            [`${T.slug}-hash`, `User ${T.slug}`],
          )
        ).rows[0].id
        await c.query(
          `INSERT INTO platform.memberships(user_id,organization_id,brand_id,role_id,state)
           VALUES ($1,$2,$3,$4,'active')`,
          [T.userId, T.orgId, T.brandId, ownerRole],
        )
        // A pre-existing team row in each brand for cross-tenant update/delete probes.
        await c.query(`INSERT INTO platform.teams(brand_id,name) VALUES ($1,'team')`, [T.brandId])
      }
    })
  })

  afterAll(async () => {
    await withControlPlane(pg, async (c) => {
      for (const T of [A, B]) {
        await c.query(`DELETE FROM platform.teams WHERE brand_id=$1`, [T.brandId]).catch(() => {})
        await c.query(`DELETE FROM platform.memberships WHERE brand_id=$1`, [T.brandId]).catch(() => {})
        await c.query(`DELETE FROM platform.brands WHERE id=$1`, [T.brandId]).catch(() => {})
        await c.query(`DELETE FROM platform.organizations WHERE id=$1`, [T.orgId]).catch(() => {})
        await c.query(`DELETE FROM platform.users WHERE id=$1`, [T.userId]).catch(() => {})
      }
    }).catch(() => {})
    await pg?.end().catch(() => {})
  })

  it('Layer 2 READ: under brand A, only brand A is visible; brand B is hidden', async () => {
    const seen = await withBrandContext(pg, { brandId: A.brandId, organizationId: A.orgId }, async (c) => {
      const mine = await c.query(`SELECT id FROM platform.brands WHERE id=$1`, [A.brandId])
      const theirs = await c.query(`SELECT id FROM platform.brands WHERE id=$1`, [B.brandId])
      return { mine: mine.rowCount, theirs: theirs.rowCount }
    })
    expect(seen.mine).toBe(1)
    expect(seen.theirs).toBe(0) // B invisible under A's context
  })

  it('FAIL CLOSED: with no brand context set, a tenant table returns zero rows', async () => {
    const n = await withControlPlane(pg, async (c) => {
      await c.query('BEGIN')
      await c.query('SET LOCAL ROLE brain_app') // RLS-subject role, but NO app.current_brand set
      const res = await c.query(`SELECT id FROM platform.brands`)
      await c.query('ROLLBACK')
      return res.rowCount
    })
    expect(n).toBe(0) // current_setting('app.current_brand', true) is NULL → policy denies all
  })

  it('Layer 2 INSERT: writing a row for brand B while in brand A is rejected (WITH CHECK)', async () => {
    await expect(
      withBrandContext(pg, { brandId: A.brandId, organizationId: A.orgId }, (c) =>
        c.query(`INSERT INTO platform.teams(brand_id,name) VALUES ($1,'evil')`, [B.brandId]),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('Layer 2 INSERT: writing a row for the active brand A succeeds', async () => {
    const ok = await withBrandContext(pg, { brandId: A.brandId, organizationId: A.orgId }, (c) =>
      c.query(`INSERT INTO platform.teams(brand_id,name) VALUES ($1,$2)`, [A.brandId, `t-${SFX}`]),
    )
    expect(ok.rowCount).toBe(1)
  })

  it('Layer 2 UPDATE/DELETE: brand B rows are untouchable from brand A (0 rows affected)', async () => {
    const res = await withBrandContext(pg, { brandId: A.brandId, organizationId: A.orgId }, async (c) => {
      const upd = await c.query(`UPDATE platform.teams SET name='hacked' WHERE brand_id=$1`, [B.brandId])
      const del = await c.query(`DELETE FROM platform.teams WHERE brand_id=$1`, [B.brandId])
      return { upd: upd.rowCount, del: del.rowCount }
    })
    expect(res.upd).toBe(0)
    expect(res.del).toBe(0)
    // B's original team row still intact (verified as superuser).
    const survived = await withControlPlane(pg, (c) =>
      c.query(`SELECT name FROM platform.teams WHERE brand_id=$1 AND name='team'`, [B.brandId]),
    )
    expect(survived.rowCount).toBe(1)
  })

  it('Access control: a user resolves context for their own brand, but NOT another tenant', async () => {
    const own = await resolveBrandContext(pg, A.userId, A.slug)
    expect(own?.brandId).toBe(A.brandId)
    expect(own?.roleName).toBe('Owner')

    const cross = await resolveBrandContext(pg, A.userId, B.slug) // A's user, B's brand
    expect(cross).toBeNull() // no membership → no context (surface renders 404)
  })

  it('Layer 3: assertBrandOwnership throws on a row that escaped the active brand', () => {
    expect(() => assertBrandOwnership([{ brand_id: B.brandId }], A.brandId)).toThrow(CrossTenantViolationError)
    expect(assertBrandOwnership([{ brand_id: A.brandId }], A.brandId)).toHaveLength(1)
  })

  // Regression: nullable-brand RLS policies (event_metadata, dlq, identity rules, consent sources, …) must
  // FAIL CLOSED (0 rows), not throw, when the app.current_brand GUC is unset/empty on a pooled connection.
  // Before the NULLIF(... ,'') fix these `current_setting(...)::uuid` policies raised "invalid input for uuid".
  it('NULLIF RLS: nullable-brand tables resolve (0+ rows), never error, with no brand context', async () => {
    const n = await withControlPlane(pg, async (c) => {
      await c.query('BEGIN')
      await c.query('SET LOCAL ROLE brain_app') // RLS-subject role, NO app.current_brand set
      const res = await c.query(`SELECT count(*)::int AS n FROM event_platform.event_metadata`)
      await c.query('ROLLBACK')
      return res.rows[0].n as number
    })
    expect(typeof n).toBe('number') // resolved, did not throw → fail-closed, not fail-broken
  })
})
