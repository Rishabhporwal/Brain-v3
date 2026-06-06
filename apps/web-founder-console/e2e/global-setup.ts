import { Pool } from 'pg'

/**
 * Deterministic slate for the onboarding e2e. Onboarding now creates an ACTIVE brand immediately and the
 * wizard skips the profile step when the user already has a workspace (isNewWorkspace). So we fully reset
 * tenancy (memberships → brands → organizations) before the suite — the local test DB is ephemeral —
 * guaranteeing a true "new user" run through all 4 steps. Roles/seed data are untouched.
 */
export default async function globalSetup() {
  const pool = new Pool({ connectionString: process.env.PG_URL ?? 'postgres://brain:brain@localhost:5440/brain' })
  try {
    await pool.query(`DELETE FROM platform.memberships`)
    await pool.query(`DELETE FROM platform.brands`)
    await pool.query(`DELETE FROM platform.organizations`)
    // eslint-disable-next-line no-console
    console.log('[e2e global-setup] tenancy reset (memberships, brands, organizations cleared)')
  } finally {
    await pool.end()
  }
}
