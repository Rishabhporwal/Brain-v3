import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { OnboardingService } from '../src/onboarding.service'
import { TrackService } from '../src/track.service'
import { ShopifyService } from '../src/shopify.service'
import { PgSeenStore } from '../src/seen-store'
import type { EventBus } from '../src/events'
import type { AuthUser } from '../src/bff.service'

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
  const orgName = `IT Co ${slug}` // organizations.name is UNIQUE → keep it per-run

  beforeAll(() => {
    pg = new Pool({ connectionString: process.env.PG_URL ?? 'postgres://brain:brain@localhost:5440/brain' })
    ch = createClient({ url: process.env.CH_URL ?? 'http://localhost:8125', username: 'default', password: '' })
    const noopBus: EventBus = { emit() {}, emitWebhook() {}, emitPull() {} }
    const noopVault = { put: async () => {}, get: async () => null }
    const shopify = new ShopifyService(pg, noopVault, noopBus, new PgSeenStore(pg))
    onboarding = new OnboardingService(pg, ch, noopBus, noopVault, shopify)
    track = new TrackService(pg, ch)
  })

  afterAll(async () => {
    await pg?.query(`DELETE FROM platform.memberships WHERE brand_id IN (SELECT id FROM platform.brands WHERE slug=$1)`, [slug]).catch(() => {})
    await pg?.query(`DELETE FROM platform.brands WHERE slug=$1`, [slug]).catch(() => {})
    await pg?.query(`DELETE FROM platform.organizations WHERE name=$1`, [orgName]).catch(() => {})
    await pg?.end().catch(() => {})
    await ch?.close().catch(() => {})
  })

  it('blocks activation until tracking is verified with real events AND costs are set', async () => {
    const started = await onboarding.start(user, { orgName, brandName: 'IT Brand', slug })
    expect(started.slug).toBe(slug)

    // Gate must reject before any signals.
    await expect(onboarding.activate(user, slug)).rejects.toThrow()

    // Configure costs + issue a write-key, then ingest a real event.
    await onboarding.configureCosts(user, slug, { cogsPct: 40, shippingMinor: 8000, codFeeMinor: 3000, gatewayPct: 2 })
    const { writeKey } = await onboarding.issueTracking(user, slug)
    await track.ingest(writeKey, { event: 'page_view', anonymousId: 'it-anon' })

    // Verification now finds the event and flips verified.
    const verified = await onboarding.verifyTracking(user, slug)
    expect(verified.verified).toBe(true)
    expect(verified.events).toBeGreaterThanOrEqual(1)

    // Gate now passes; brand flips to active and re-activation is idempotent.
    const activated = await onboarding.activate(user, slug)
    expect(activated.slug).toBe(slug)
    const again = await onboarding.activate(user, slug)
    expect((again as { alreadyActive?: boolean }).alreadyActive).toBe(true)

    const { rows } = await pg.query<{ status: string }>(`SELECT status FROM platform.brands WHERE slug=$1`, [slug])
    expect(rows[0].status).toBe('active')
  })
})
