import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { OnboardingService } from '../src/application/onboarding.service'
import { TrackService } from '../src/application/track.service'
import { ShopifyService } from '../src/application/shopify.service'
import type { EventBus } from '../src/infrastructure/messaging/events'
import type { AuthUser } from '../src/application/bff.service'

/**
 * M6 — integration coverage: the full provisioning → active sequence against the real local stack
 * (Postgres + ClickHouse). Opt-in via RUN_DB_TESTS=1 (the CI e2e job has the stack); skipped otherwise
 * so `pnpm test` stays green on a bare checkout. Mirrors the path the wizard/e2e drive, at the service layer.
 */
const RUN = process.env.RUN_DB_TESTS === '1'
const user: AuthUser = { sub: `it-${process.pid}`, email: `it-${process.pid}@brain.dev` }

describe.skipIf(!RUN)('onboarding provisioning → active (integration)', () => {
  let pg: Pool
  let ch: ClickHouseClient
  let onboarding: OnboardingService
  let track: TrackService
  const slug = `it${Date.now()}`

  beforeAll(() => {
    pg = new Pool({ connectionString: process.env.PG_URL ?? 'postgres://brain:brain@localhost:5440/brain' })
    ch = createClient({ url: process.env.CH_URL ?? 'http://localhost:8125', username: 'default', password: '' })
    const noopBus: EventBus = { emit() {}, emitWebhook() {}, emitPull() {} }
    const noopVault = { put: async () => {}, get: async () => null }
    const shopify = new ShopifyService(pg, noopVault, noopBus)
    onboarding = new OnboardingService(pg, ch, noopBus, noopVault, shopify)
    track = new TrackService(pg, ch)
  })

  afterAll(async () => {
    const org = await pg
      ?.query<{ organization_id: string }>(`SELECT organization_id FROM platform.brands WHERE slug=$1`, [slug])
      .catch(() => null)
    await pg
      ?.query(`DELETE FROM platform.memberships WHERE brand_id IN (SELECT id FROM platform.brands WHERE slug=$1)`, [
        slug,
      ])
      .catch(() => {})
    await pg?.query(`DELETE FROM platform.brands WHERE slug=$1`, [slug]).catch(() => {})
    if (org?.rows[0])
      await pg?.query(`DELETE FROM platform.organizations WHERE id=$1`, [org.rows[0].organization_id]).catch(() => {})
    await pg?.end().catch(() => {})
    await ch?.close().catch(() => {})
  })

  it('completes onboarding (active brand) and supports costs + tracking settings', async () => {
    // Single-shot onboarding → brand created ACTIVE immediately, with the chosen region.
    const res = await onboarding.complete(user, {
      fullName: 'IT User',
      role: 'founder',
      brandName: 'IT Brand',
      slug,
      region: 'AE',
      platform: 'shopify',
      connectShopify: false,
    })
    expect(res.redirectTo).toBe(`/w/${slug}/dashboard`)

    const brand = await pg.query<{ status: string; region: string; currency: string }>(
      `SELECT status, region, currency FROM platform.brands WHERE slug=$1`,
      [slug],
    )
    expect(brand.rows[0].status).toBe('active')
    expect(brand.rows[0].region).toBe('AE')
    expect(brand.rows[0].currency).toBe('AED')

    // Settings → Costs roundtrip.
    await onboarding.configureCosts(user, slug, { cogsPct: 40, shippingMinor: 8000, codFeeMinor: 3000, gatewayPct: 2 })
    const costs = await onboarding.getCosts(slug)
    expect(costs.cogsPct).toBe(40)
    expect(costs.shippingMinor).toBe(8000)

    // Settings → Tracking: issue a key, ingest a real event, verify against ClickHouse.
    const { writeKey } = await onboarding.issueTracking(user, slug)
    await track.ingest(writeKey, { event: 'page_view', anonymousId: 'it-anon' })
    const verified = await onboarding.verifyTracking(user, slug)
    expect(verified.verified).toBe(true)
    expect(verified.events).toBeGreaterThanOrEqual(1)
  })
})
