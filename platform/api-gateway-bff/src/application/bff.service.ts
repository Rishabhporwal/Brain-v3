import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { Pool } from 'pg'
import type { ClickHouseClient } from '@clickhouse/client'
import { AccessControl, type BrandContext } from '@brain/access-control'
import { metricClientFromEnv } from '@brain/metric-client'
import { CH_CLIENT, PG_POOL } from '../persistence/db.providers'
import { IdentityService } from './identity.service'

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

/** Map a platform.roles name (e.g. "Owner", "Marketing Manager", "Read Only") to the web app's coarse
 *  WorkspaceRole ('OWNER' | 'ADMIN' | 'MANAGER' | 'ANALYST' | 'VIEWER'). */
function workspaceRole(name: string): 'OWNER' | 'ADMIN' | 'MANAGER' | 'ANALYST' | 'VIEWER' {
  const n = name.trim().toLowerCase()
  if (n === 'owner') return 'OWNER'
  if (n.includes('admin')) return 'ADMIN' // 'Admin' and 'Brand Admin'
  if (n.includes('manager')) return 'MANAGER'
  if (n.includes('analyst')) return 'ANALYST'
  return 'VIEWER'
}

@Injectable()
export class BffService {
  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(CH_CLIENT) private readonly ch: ClickHouseClient,
    private readonly ac: AccessControl,
    private readonly identity: IdentityService,
  ) {}

  /**
   * Resolve + REQUIRE the caller's brand context (membership enforced). Throws NoBrandAccessError → 404,
   * so a non-member can never read a brand's data. Use for every tenant-scoped read.
   */
  private async requireContext(user: AuthUser, slug: string): Promise<BrandContext> {
    const uid = await this.identity.userIdForSub(user.sub, user.email)
    return this.ac.contextFor(uid, slug)
  }

  private toWorkspace(b: BrandRow) {
    return { id: b.id, name: b.name, slug: b.slug, logoUrl: null, plan: 'growth', currency: b.currency, features: null }
  }

  /** The caller's permission set for a brand (drives UI visibility; enforcement is server-side). */
  async permissions(user: AuthUser, slug: string) {
    const ctx = await this.requireContext(user, slug)
    return this.ac.permissionsFor(ctx)
  }

  async me(user: AuthUser) {
    const uid = await this.identity.userIdForSub(user.sub, user.email)
    // Control-plane: spans every brand the user belongs to, so it cannot be brand-RLS-bound. Explicitly
    // scoped by user_id. Org-level memberships (brand_id NULL) reach every brand in the org.
    const rows = await this.ac.controlPlane(async (c) => {
      const res = await c.query<BrandRow & { role: string }>(
        `SELECT b.id, b.name, b.slug, b.currency, r.name AS role
           FROM platform.memberships m
           JOIN platform.brands b
             ON b.id = m.brand_id OR (m.brand_id IS NULL AND b.organization_id = m.organization_id)
           JOIN platform.roles r ON r.id = m.role_id
          WHERE m.user_id = $1 AND m.state = 'active' AND b.status = 'active'
          ORDER BY b.created_at`,
        [uid],
      )
      return res.rows
    })
    return { memberships: rows.map((b) => ({ role: workspaceRole(b.role), workspace: this.toWorkspace(b) })) }
  }

  /** Resolve the caller's membership for a workspace. Returns nulls when the caller is NOT a member, so
   *  the BFF never discloses a workspace the user can't access (the web layer renders 404 on null). */
  async context(user: AuthUser, slug: string) {
    const uid = await this.identity.userIdForSub(user.sub, user.email)
    const ctx = await this.ac.tryContextFor(uid, slug)
    if (!ctx) return { workspace: null, membership: null }
    // Read the brand profile UNDER RLS (Layer 1+2) — proves the active-brand context works end to end.
    const b = await this.ac.runInBrand(ctx, async (c) => {
      const res = await c.query<BrandRow>(`SELECT id, name, slug, currency FROM platform.brands WHERE id = $1`, [
        ctx.brandId,
      ])
      return res.rows[0]
    })
    if (!b) return { workspace: null, membership: null }
    return { workspace: this.toWorkspace(b), membership: { role: workspaceRole(ctx.roleName) } }
  }

  /** Festivals for the workspace's region (Settings → Festivals) — from the global reference calendar. */
  async festivals(user: AuthUser, slug: string): Promise<Array<{ date: string; name: string; multiplier: number }>> {
    const ctx = await this.requireContext(user, slug)
    return this.ac.runInBrand(ctx, async (c) => {
      const res = await c.query<{ date: string; name: string; multiplier: number }>(
        `SELECT f.date, f.name, f.multiplier
           FROM reference.festival_calendar f
           JOIN platform.brands b ON b.region = f.region
          WHERE b.id = $1 ORDER BY f.date`,
        [ctx.brandId],
      )
      return res.rows
    })
  }

  private chQuery<T>(query: string, brandId: string) {
    return this.ch
      .query({
        query,
        query_params: { b: brandId },
        clickhouse_settings: { brain_current_brand: brandId },
        format: 'JSONEachRow',
      })
      .then((r) => r.json() as Promise<T[]>)
  }

  // An order counts toward realized revenue unless it's in a non-realized financial state.
  // Provider-agnostic: Shopify uses 'paid'/'voided'/'refunded'; WooCommerce maps completed→'paid';
  // empty status (providers that don't send one) is treated as realized so data still surfaces.
  private static readonly REALIZED = `financial_status NOT IN ('voided','refunded','pending','cancelled','partially_refunded','declined','expired')`

  async summary(user: AuthUser, slug: string) {
    const ctx = await this.requireContext(user, slug)
    const brandId = ctx.brandId

    // Invariant 1 slot-in (Arch v2 Appendix / ADR-0004): when a metric engine is configured the
    // read-model quotes IT — the inline computation below survives only as the no-engine fallback
    // and degrades explicitly (engine unreachable → fallback, never a silent wrong number).
    const engine = metricClientFromEnv()
    if (engine) {
      const res = await engine.getMetrics(brandId)
      if (res) {
        const m: Record<string, number> = {}
        for (const v of res.metrics) m[v.id] = v.value
        return {
          metrics: m,
          asOf: res.computed_at.slice(0, 10),
          source: 'metric-engine',
          estimated: res.metrics.filter((v) => v.estimated).map((v) => v.id),
        }
      }
    }

    // ── Revenue & orders: source of truth is the ingested order facts (Shopify/Woo/…).
    //    total_price is Decimal major units → ×100 to integer-minor (the metric registry convention).
    const ord = await this.chQuery<{ orders: number; revenue_minor: number }>(
      `SELECT countIf(${BffService.REALIZED}) AS orders,
              toInt64(round(toFloat64(sumIf(total_price, ${BffService.REALIZED})) * 100)) AS revenue_minor
         FROM brain.orders FINAL WHERE brand_id = {b:UUID}`,
      brandId,
    )
    let orders = Number(ord[0]?.orders ?? 0)
    let revenue = Number(ord[0]?.revenue_minor ?? 0)
    // Fallback to first-party pixel purchases for brands not yet connected to a store.
    if (!orders) {
      const px = await this.chQuery<{ orders: number; revenue_minor: number }>(
        `SELECT countIf(event_type='purchase') AS orders,
                sumIf(toFloat64OrZero(JSONExtractString(props,'value')), event_type='purchase') AS revenue_minor
           FROM brain.customer_events WHERE brand_id = {b:UUID}`,
        brandId,
      )
      orders = Number(px[0]?.orders ?? 0)
      revenue = Number(px[0]?.revenue_minor ?? 0)
    }

    // ── Ad spend: source of truth is the normalized ad_spend facts (Google/Meta). spend_minor is already minor.
    const ad = await this.chQuery<{ spend: number }>(
      `SELECT sum(spend_minor) AS spend FROM brain.ad_spend FINAL WHERE brand_id = {b:UUID}`,
      brandId,
    )
    let spend = Number(ad[0]?.spend ?? 0)
    if (!spend) {
      const fs = await this.chQuery<{ spend: number }>(
        `SELECT sum(spend_minor) AS spend FROM brain.fact_spend WHERE brand_id = {b:UUID}`,
        brandId,
      )
      spend = Number(fs[0]?.spend ?? 0)
    }

    // ── Sessions & conversion: genuinely first-party (orders carry no session signal).
    const px = await this.chQuery<{ sessions: number; conversions: number }>(
      `SELECT uniqExact(session_id) AS sessions,
              countIf(event_type='checkout_completed') AS conversions
         FROM brain.customer_events WHERE brand_id = {b:UUID}`,
      brandId,
    )
    const sessions = Number(px[0]?.sessions ?? 0)
    const conversions = Number(px[0]?.conversions ?? 0)

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
  async detail(user: AuthUser, slug: string) {
    const ctx = await this.requireContext(user, slug) // enforces membership (404 for non-members)
    const b = { id: ctx.brandId } // ClickHouse reads are brand-scoped via brand_id = ctx.brandId

    // ── Weekly timeseries from ingested orders (revenue in minor, order count); sessions overlaid from pixel.
    let timeseries = await this.chQuery<{ label: string; realized_revenue: number; orders: number; sessions: number }>(
      `SELECT toString(toStartOfWeek(ordered_at)) AS label,
              toFloat64(toInt64(round(toFloat64(sumIf(total_price, ${BffService.REALIZED})) * 100))) AS realized_revenue,
              toFloat64(countIf(${BffService.REALIZED})) AS orders,
              toFloat64(0) AS sessions
         FROM brain.orders FINAL WHERE brand_id = {b:UUID}
        GROUP BY label ORDER BY label`,
      b.id,
    )
    if (timeseries.length) {
      // Fill sessions per week from the first-party pixel and merge by label.
      const sess = await this.chQuery<{ label: string; sessions: number }>(
        `SELECT toString(toStartOfWeek(ts)) AS label, toFloat64(uniqExact(session_id)) AS sessions
           FROM brain.customer_events WHERE brand_id = {b:UUID} GROUP BY label`,
        b.id,
      )
      const sMap = new Map(sess.map((r) => [r.label, Number(r.sessions)]))
      timeseries = timeseries.map((t) => ({ ...t, sessions: sMap.get(t.label) ?? 0 }))
    } else {
      // Fallback: brand not yet connected → pixel-derived timeseries.
      timeseries = await this.chQuery(
        `SELECT toString(toStartOfWeek(ts)) AS label,
                sumIf(toFloat64OrZero(JSONExtractString(props,'value')), event_type='purchase') AS realized_revenue,
                toFloat64(countIf(event_type='purchase')) AS orders,
                toFloat64(uniqExact(session_id)) AS sessions
           FROM brain.customer_events WHERE brand_id = {b:UUID}
          GROUP BY label ORDER BY label`,
        b.id,
      )
    }

    // ── Revenue-by-provider breakdown from orders (where the money comes from); pixel-source fallback.
    let breakdown = await this.chQuery<{ label: string; value: number }>(
      `SELECT provider AS label, toFloat64(toInt64(round(toFloat64(sumIf(total_price, ${BffService.REALIZED})) * 100))) AS value
         FROM brain.orders FINAL WHERE brand_id = {b:UUID} GROUP BY provider ORDER BY value DESC`,
      b.id,
    )
    if (!breakdown.length) {
      breakdown = await this.chQuery(
        `SELECT source AS label, toFloat64(count()) AS value
           FROM brain.customer_events WHERE brand_id = {b:UUID} GROUP BY source ORDER BY value DESC`,
        b.id,
      )
    }

    // ── Per-SKU rows: only the pixel carries line-item SKUs today (orders are order-level).
    //    Line-item ingestion is a future enhancement; until then this stays first-party.
    const rows = await this.chQuery<{ sku: string; orders: number; revenue: number }>(
      `SELECT JSONExtractString(props,'sku') AS sku, toFloat64(count()) AS orders,
              sum(toFloat64OrZero(JSONExtractString(props,'value'))) AS revenue
         FROM brain.customer_events WHERE brand_id = {b:UUID} AND event_type='purchase'
        GROUP BY sku ORDER BY revenue DESC LIMIT 10`,
      b.id,
    )

    // ── Payment-method mix from ingested payment facts (Razorpay/…); pixel-source fallback.
    let paymentBreakdown = await this.chQuery<{ label: string; value: number }>(
      `SELECT method AS label, toFloat64(toInt64(round(sum(amount_minor)))) AS value
         FROM brain.payments FINAL
        WHERE brand_id = {b:UUID} AND method != ''
          AND status NOT IN ('failed','refunded','created','authorized','declined')
        GROUP BY method ORDER BY value DESC`,

      b.id,
    )
    if (!paymentBreakdown.length) {
      paymentBreakdown = await this.chQuery(
        `SELECT JSONExtractString(props,'payment') AS label, toFloat64(count()) AS value
           FROM brain.customer_events WHERE brand_id = {b:UUID} AND event_type='purchase'
             AND JSONExtractString(props,'payment') != '' GROUP BY label ORDER BY value DESC`,
        b.id,
      )
    }

    // ── Courier mix: no courier dimension in connector facts yet → first-party only.
    const courierBreakdown = await this.chQuery<{ label: string; value: number }>(
      `SELECT JSONExtractString(props,'courier') AS label, toFloat64(count()) AS value
         FROM brain.customer_events WHERE brand_id = {b:UUID} AND event_type='purchase'
           AND JSONExtractString(props,'courier') != '' GROUP BY label ORDER BY value DESC`,
      b.id,
    )

    // ── CM waterfall on realized order revenue + real ad spend (both integer-minor).
    const tot = await this.chQuery<{ revenue: number }>(
      `SELECT toInt64(round(toFloat64(sumIf(total_price, ${BffService.REALIZED})) * 100)) AS revenue
         FROM brain.orders FINAL WHERE brand_id = {b:UUID}`,
      b.id,
    )
    let rev = Number(tot[0]?.revenue ?? 0)
    if (!rev) {
      const px = await this.chQuery<{ revenue: number }>(
        `SELECT sumIf(toFloat64OrZero(JSONExtractString(props,'value')), event_type='purchase') AS revenue
           FROM brain.customer_events WHERE brand_id = {b:UUID}`,
        b.id,
      )
      rev = Number(px[0]?.revenue ?? 0)
    }
    const ad = await this.chQuery<{ spend: number }>(
      `SELECT sum(spend_minor) AS spend FROM brain.ad_spend FINAL WHERE brand_id = {b:UUID}`,
      b.id,
    )
    let spend = Number(ad[0]?.spend ?? 0)
    if (!spend) {
      const fs = await this.chQuery<{ spend: number }>(
        `SELECT sum(spend_minor) AS spend FROM brain.fact_spend WHERE brand_id = {b:UUID}`,
        b.id,
      )
      spend = Number(fs[0]?.spend ?? 0)
    }
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

    const uid = await this.identity.userIdForSub(user.sub, user.email)
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
