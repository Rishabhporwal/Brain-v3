import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Pool } from 'pg'
import type { ClickHouseClient } from '@clickhouse/client'
import { CH_CLIENT, PG_POOL } from './db.providers'

export interface AuthUser {
  sub: string
  email?: string
  name?: string
}
interface BrandRow {
  id: string
  name: string
  slug: string
  currency: string
}

@Injectable()
export class BffService {
  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(CH_CLIENT) private readonly ch: ClickHouseClient,
  ) {}

  private toWorkspace(b: BrandRow) {
    return { id: b.id, name: b.name, slug: b.slug, logoUrl: null, plan: 'growth', currency: b.currency, features: null }
  }

  private async workspaceBySlug(slug: string): Promise<BrandRow | undefined> {
    const { rows } = await this.pg.query<BrandRow>(
      `SELECT id, name, slug, currency FROM platform.brands WHERE slug = $1 LIMIT 1`,
      [slug],
    )
    return rows[0]
  }

  private async userIdForSub(sub: string, email?: string): Promise<string> {
    const { rows } = await this.pg.query<{ id: string }>(
      `INSERT INTO platform.users(email_hash, display_name) VALUES ($1, $2)
       ON CONFLICT (email_hash) DO UPDATE SET display_name = COALESCE(platform.users.display_name, $2)
       RETURNING id`,
      [sub, email ?? null],
    )
    return rows[0].id
  }

  async me(user: AuthUser) {
    const uid = await this.userIdForSub(user.sub, user.email)
    const { rows } = await this.pg.query<BrandRow>(
      `SELECT b.id, b.name, b.slug, b.currency
         FROM platform.memberships m JOIN platform.brands b ON b.id = m.brand_id
        WHERE m.user_id = $1 AND m.state = 'active' AND b.status = 'active'
        ORDER BY m.created_at`,
      [uid],
    )
    return { memberships: rows.map((b) => ({ role: 'OWNER', workspace: this.toWorkspace(b) })) }
  }

  async context(slug: string) {
    const b = await this.workspaceBySlug(slug)
    if (!b) throw new NotFoundException('workspace not found')
    return { workspace: this.toWorkspace(b), membership: { role: 'OWNER' } }
  }

  private chQuery<T>(query: string, brandId: string) {
    return this.ch
      .query({ query, query_params: { b: brandId }, clickhouse_settings: { brain_current_brand: brandId }, format: 'JSONEachRow' })
      .then((r) => r.json() as Promise<T[]>)
  }

  async summary(slug: string) {
    const b = await this.workspaceBySlug(slug)
    if (!b) throw new NotFoundException('workspace not found')
    const ev = await this.chQuery<{ orders: number; revenue_minor: number; sessions: number; conversions: number }>(
      `SELECT countIf(event_type='purchase') AS orders,
              sumIf(toFloat64OrZero(JSONExtractString(props,'value')), event_type='purchase') AS revenue_minor,
              uniqExact(session_id) AS sessions,
              countIf(event_type='checkout_completed') AS conversions
         FROM brain.customer_events WHERE brand_id = {b:UUID}`,
      b.id,
    )
    const sp = await this.chQuery<{ spend: number }>(
      `SELECT sum(spend_minor) AS spend FROM brain.fact_spend WHERE brand_id = {b:UUID}`,
      b.id,
    )
    const e = ev[0] ?? ({} as Record<string, number>)
    const spend = Number(sp[0]?.spend ?? 0)
    const orders = Number(e.orders ?? 0)
    const revenue = Number(e.revenue_minor ?? 0)
    const sessions = Number(e.sessions ?? 0)
    const conversions = Number(e.conversions ?? 0)

    const m: Record<string, number> = {}
    if (revenue) m.realized_revenue = revenue
    if (orders) m.orders = orders
    if (orders && revenue) m.aov = Math.round(revenue / orders)
    if (sessions) m.sessions = sessions
    if (conversions) m.conversions = conversions
    if (sessions && conversions) m.conversion_rate = Math.round((conversions / sessions) * 1000) / 10
    if (spend) m.spend = spend
    if (spend && revenue) m.mer = Math.round((revenue / spend) * 100) / 100
    if (spend && revenue) m.roas = m.mer
    return { metrics: m, asOf: new Date().toISOString().slice(0, 10) }
  }

  /** Detail data for a surface's chart/table. Returns whichever shapes the surface's viz consumes. */
  async detail(slug: string) {
    const b = await this.workspaceBySlug(slug)
    if (!b) throw new NotFoundException('workspace not found')
    const timeseries = await this.chQuery<{ label: string; realized_revenue: number; orders: number; sessions: number }>(
      `SELECT toString(toStartOfWeek(ts)) AS label,
              sumIf(toFloat64OrZero(JSONExtractString(props,'value')), event_type='purchase') AS realized_revenue,
              toFloat64(countIf(event_type='purchase')) AS orders,
              toFloat64(uniqExact(session_id)) AS sessions
         FROM brain.customer_events WHERE brand_id = {b:UUID}
        GROUP BY label ORDER BY label`,
      b.id,
    )
    const breakdown = await this.chQuery<{ label: string; value: number }>(
      `SELECT source AS label, toFloat64(count()) AS value
         FROM brain.customer_events WHERE brand_id = {b:UUID} GROUP BY source ORDER BY value DESC`,
      b.id,
    )
    const rows = await this.chQuery<{ sku: string; orders: number; revenue: number }>(
      `SELECT JSONExtractString(props,'sku') AS sku, toFloat64(count()) AS orders,
              sum(toFloat64OrZero(JSONExtractString(props,'value'))) AS revenue
         FROM brain.customer_events WHERE brand_id = {b:UUID} AND event_type='purchase'
        GROUP BY sku ORDER BY revenue DESC LIMIT 10`,
      b.id,
    )
    const paymentBreakdown = await this.chQuery<{ label: string; value: number }>(
      `SELECT JSONExtractString(props,'payment') AS label, toFloat64(count()) AS value
         FROM brain.customer_events WHERE brand_id = {b:UUID} AND event_type='purchase'
           AND JSONExtractString(props,'payment') != '' GROUP BY label ORDER BY value DESC`,
      b.id,
    )
    const courierBreakdown = await this.chQuery<{ label: string; value: number }>(
      `SELECT JSONExtractString(props,'courier') AS label, toFloat64(count()) AS value
         FROM brain.customer_events WHERE brand_id = {b:UUID} AND event_type='purchase'
           AND JSONExtractString(props,'courier') != '' GROUP BY label ORDER BY value DESC`,
      b.id,
    )
    const tot = await this.chQuery<{ revenue: number }>(
      `SELECT sumIf(toFloat64OrZero(JSONExtractString(props,'value')), event_type='purchase') AS revenue
         FROM brain.customer_events WHERE brand_id = {b:UUID}`,
      b.id,
    )
    const sp = await this.chQuery<{ spend: number }>(
      `SELECT sum(spend_minor) AS spend FROM brain.fact_spend WHERE brand_id = {b:UUID}`,
      b.id,
    )
    const rev = Number(tot[0]?.revenue ?? 0)
    const spend = Number(sp[0]?.spend ?? 0)
    // CM waterfall on REAL revenue/spend; cost ratios are modelled until per-SKU cost data lands (Phase 2).
    const waterfall = rev
      ? [
          { label: 'Net Revenue', value: Math.round(rev), kind: 'start' as const },
          { label: 'COGS', value: -Math.round(rev * 0.42), kind: 'subtract' as const },
          { label: 'Shipping', value: -Math.round(rev * 0.075), kind: 'subtract' as const },
          { label: 'Payment & COD', value: -Math.round(rev * 0.03), kind: 'subtract' as const },
          { label: 'RTO & Returns', value: -Math.round(rev * 0.095), kind: 'subtract' as const },
          { label: 'Marketing', value: -Math.round(spend), kind: 'subtract' as const },
          { label: 'CM2', value: Math.round(rev * 0.38 - spend), kind: 'total' as const },
        ]
      : []
    return { timeseries, breakdown, rows, paymentBreakdown, courierBreakdown, waterfall }
  }

  async onboarding(user: AuthUser, body: Record<string, string>) {
    const orgName = body.orgName
    const brandName = body.brandName
    const slug = body.slug
    const region = body.region ?? 'IN'
    const currency = body.currency ?? 'INR'
    const timezone = body.timezone ?? 'Asia/Kolkata'
    if (!orgName || !brandName || !slug) throw new ConflictException('orgName, brandName, slug are required')

    const taken = await this.pg.query(`SELECT 1 FROM platform.brands WHERE slug = $1 LIMIT 1`, [slug])
    if (taken.rowCount) throw new ConflictException('That handle is already taken')

    const uid = await this.userIdForSub(user.sub, user.email)
    const client = await this.pg.connect()
    try {
      await client.query('BEGIN')
      const org = await client.query<{ id: string }>(
        `INSERT INTO platform.organizations(name, region, currency, timezone, billing_basis)
         VALUES ($1,$2,$3,$4,'gmv_percent') RETURNING id`,
        [orgName, region, currency, timezone],
      )
      const brand = await client.query<{ id: string; slug: string }>(
        `INSERT INTO platform.brands(organization_id, name, slug, region, currency, timezone, status)
         VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id, slug`,
        [org.rows[0].id, brandName, slug, region, currency, timezone],
      )
      const role = await client.query<{ id: string }>(
        `SELECT id FROM platform.roles WHERE scope='org' AND name='Owner' LIMIT 1`,
      )
      await client.query(
        `INSERT INTO platform.memberships(user_id, organization_id, brand_id, role_id, state)
         VALUES ($1,$2,$3,$4,'active')`,
        [uid, org.rows[0].id, brand.rows[0].id, role.rows[0].id],
      )
      await client.query('COMMIT')
      return { slug: brand.rows[0].slug }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }
}
