// Brain dev BFF — verifies Keycloak access tokens and serves the console read-model from the local
// Postgres + ClickHouse. Real numbers (computed from the DB) replace the frontend's dev sample data
// once the web app points NEXT_PUBLIC_API_BASE_URL at this server.
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import pg from 'pg'
import { createClient } from '@clickhouse/client'

const PORT = Number(process.env.PORT ?? 4000)
const ISSUER = process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/brain'
const PG_URL = process.env.PG_URL ?? 'postgres://brain:brain@localhost:5440/brain'
const CH_URL = process.env.CH_URL ?? 'http://localhost:8125'

const pool = new pg.Pool({ connectionString: PG_URL })
const ch = createClient({ url: CH_URL, username: 'default', password: '' })
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/protocol/openid-connect/certs`))

const app = Fastify({ logger: false })
await app.register(cors, { origin: true, credentials: true })

// --- auth: verify the Keycloak bearer on everything except /health ---
app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing bearer token' })
  try {
    const { payload } = await jwtVerify(auth.slice(7), JWKS, { issuer: ISSUER })
    req.user = { sub: payload.sub, email: payload.email, name: payload.name ?? payload.preferred_username }
  } catch {
    return reply.code(401).send({ error: 'invalid token' })
  }
})

app.get('/health', async () => ({ ok: true }))

// Workspace row by slug (BFF runs as the brain role → RLS bypassed; real V2 sets app.current_brand).
async function workspaceBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT id, name, slug, currency, status FROM platform.brands WHERE slug = $1 LIMIT 1`,
    [slug],
  )
  return rows[0]
}

function toWorkspace(b) {
  return { id: b.id, name: b.name, slug: b.slug, logoUrl: null, plan: 'growth', currency: b.currency, features: null }
}

// Map the Keycloak subject to a platform user (dev: email_hash holds the sub as a stable key).
async function userIdForSub(sub, email) {
  const { rows } = await pool.query(
    `INSERT INTO platform.users(email_hash, display_name) VALUES ($1, $2)
     ON CONFLICT (email_hash) DO UPDATE SET display_name = COALESCE(platform.users.display_name, $2)
     RETURNING id`,
    [sub, email ?? null],
  )
  return rows[0].id
}

// Per-user memberships → drives onboarding (none) vs dashboard (some).
app.get('/me', async (req) => {
  const uid = await userIdForSub(req.user.sub, req.user.email)
  const { rows } = await pool.query(
    `SELECT b.id, b.name, b.slug, b.currency
       FROM platform.memberships m JOIN platform.brands b ON b.id = m.brand_id
      WHERE m.user_id = $1 AND m.state = 'active' AND b.status = 'active'
      ORDER BY m.created_at`,
    [uid],
  )
  return { memberships: rows.map((b) => ({ role: 'OWNER', workspace: toWorkspace(b) })) }
})

// Onboarding: create org + brand + owner membership, return the new slug.
app.post('/api/onboarding', async (req, reply) => {
  const b = req.body ?? {}
  const { orgName, brandName, slug } = b
  const region = b.region ?? 'IN'
  const currency = b.currency ?? 'INR'
  const timezone = b.timezone ?? 'Asia/Kolkata'
  if (!orgName || !brandName || !slug) return reply.code(400).send({ error: 'orgName, brandName, slug are required' })

  // The console routes by global slug, so enforce global uniqueness here.
  const taken = await pool.query(`SELECT 1 FROM platform.brands WHERE slug = $1 LIMIT 1`, [slug])
  if (taken.rowCount) return reply.code(409).send({ error: 'That handle is already taken' })

  const uid = await userIdForSub(req.user.sub, req.user.email)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const org = await client.query(
      `INSERT INTO platform.organizations(name, region, currency, timezone, billing_basis)
       VALUES ($1, $2, $3, $4, 'gmv_percent') RETURNING id`,
      [orgName, region, currency, timezone],
    )
    const brand = await client.query(
      `INSERT INTO platform.brands(organization_id, name, slug, region, currency, timezone, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id, slug`,
      [org.rows[0].id, brandName, slug, region, currency, timezone],
    )
    const role = await client.query(`SELECT id FROM platform.roles WHERE scope = 'org' AND name = 'Owner' LIMIT 1`)
    await client.query(
      `INSERT INTO platform.memberships(user_id, organization_id, brand_id, role_id, state)
       VALUES ($1, $2, $3, $4, 'active')`,
      [uid, org.rows[0].id, brand.rows[0].id, role.rows[0].id],
    )
    await client.query('COMMIT')
    return { slug: brand.rows[0].slug }
  } catch (e) {
    await client.query('ROLLBACK')
    if (e.code === '23505') return reply.code(409).send({ error: 'That handle is already taken' })
    throw e
  } finally {
    client.release()
  }
})

app.get('/api/workspaces/:slug/context', async (req, reply) => {
  const b = await workspaceBySlug(req.params.slug)
  if (!b) return reply.code(404).send({ error: 'workspace not found' })
  return { workspace: toWorkspace(b), membership: { role: 'OWNER' } }
})

// Compute the metric bag from ClickHouse for the brand. Only DB-derivable metrics are returned;
// the rest are omitted, so the console shows "—" honestly (Phase-1 data has no margin/RTO facts yet).
async function metricsFor(brandId) {
  // Scope every query to the brand via the row-policy setting (the gateway pattern) AND an explicit filter.
  const settings = { brain_current_brand: brandId }
  const ev = await ch
    .query({
      query: `
        SELECT
          countIf(event_type = 'purchase') AS orders,
          sumIf(toFloat64OrZero(JSONExtractString(props, 'value')), event_type = 'purchase') AS revenue_minor,
          uniqExact(session_id) AS sessions,
          countIf(event_type = 'checkout_completed') AS conversions
        FROM brain.customer_events WHERE brand_id = {b:UUID}`,
      query_params: { b: brandId },
      clickhouse_settings: settings,
      format: 'JSONEachRow',
    })
    .then((r) => r.json())
  const sp = await ch
    .query({
      query: `SELECT sum(spend_minor) AS spend, sum(clicks) AS clicks, sum(impressions) AS impressions
              FROM brain.fact_spend WHERE brand_id = {b:UUID}`,
      query_params: { b: brandId },
      clickhouse_settings: settings,
      format: 'JSONEachRow',
    })
    .then((r) => r.json())

  const e = ev[0] ?? {}
  const s = sp[0] ?? {}
  const orders = Number(e.orders ?? 0)
  const revenue = Number(e.revenue_minor ?? 0)
  const sessions = Number(e.sessions ?? 0)
  const conversions = Number(e.conversions ?? 0)
  const spend = Number(s.spend ?? 0)

  const m = {}
  if (revenue) m.realized_revenue = revenue
  if (orders) m.orders = orders
  if (orders && revenue) m.aov = Math.round(revenue / orders)
  if (sessions) m.sessions = sessions
  if (conversions) m.conversions = conversions
  if (sessions && conversions) m.conversion_rate = Math.round((conversions / sessions) * 1000) / 10
  if (spend) m.spend = spend
  if (spend && revenue) m.mer = Math.round((revenue / spend) * 100) / 100
  if (spend && revenue) m.roas = m.mer
  return m
}

async function summaryHandler(req, reply) {
  const b = await workspaceBySlug(req.params.slug)
  if (!b) return reply.code(404).send({ error: 'workspace not found' })
  const metrics = await metricsFor(b.id)
  return { metrics, asOf: new Date().toISOString().slice(0, 10) }
}

app.get('/api/workspaces/:slug/dashboard/summary', summaryHandler)
app.get('/api/workspaces/:slug/:surface/summary', summaryHandler)

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  // eslint-disable-next-line no-console
  console.log(`[brain-dev-bff] listening on http://localhost:${PORT}  (issuer ${ISSUER})`)
})
