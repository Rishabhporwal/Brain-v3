import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  type ConnectorHooks,
  type CursorStore,
  InMemorySeenStore,
  type PullPublisher,
  TokenBucket,
  runStreamSync,
  safeReturnTo,
  signOAuthState,
  verifyHmac,
  verifyOAuthState,
  withRetry,
} from '../src/index'

const SECRET = 'kit-secret'

describe('oauth state', () => {
  it('round-trips a valid state', () => {
    const t = signOAuthState(SECRET, { provider: 'shopify', brandId: 'b', exp: Math.floor(Date.now() / 1000) + 600 })
    expect(verifyOAuthState(SECRET, t).provider).toBe('shopify')
  })
  it('rejects tampered / wrong-secret / expired / malformed', () => {
    const t = signOAuthState(SECRET, { provider: 'p', brandId: 'b', exp: Math.floor(Date.now() / 1000) + 600 })
    expect(() => verifyOAuthState(SECRET, `${t.slice(0, -2)}xx`)).toThrow()
    expect(() => verifyOAuthState('other', t)).toThrow(/signature/)
    expect(() => verifyOAuthState(SECRET, signOAuthState(SECRET, { provider: 'p', brandId: 'b', exp: 1 }))).toThrow(
      /expired/,
    )
    expect(() => verifyOAuthState(SECRET, 'nope')).toThrow()
  })
})

describe('safeReturnTo', () => {
  it('keeps safe relative paths, rejects open redirects', () => {
    expect(safeReturnTo('/w/acme/settings')).toBe('/w/acme/settings')
    expect(safeReturnTo('//evil.com')).toBe('/onboarding')
    expect(safeReturnTo('http://evil.com/x')).toBe('/onboarding')
    expect(safeReturnTo(undefined)).toBe('/onboarding')
  })
})

describe('verifyHmac', () => {
  it('verifies base64 (Shopify-style) and hex, constant-time', () => {
    const body = Buffer.from('{"id":1}')
    const b64 = createHmac('sha256', SECRET).update(body).digest('base64')
    const hex = createHmac('sha256', SECRET).update(body).digest('hex')
    expect(verifyHmac(body, b64, SECRET, 'base64')).toBe(true)
    expect(verifyHmac(body, hex, SECRET, 'hex')).toBe(true)
    expect(verifyHmac(body, 'wrong', SECRET, 'base64')).toBe(false)
    expect(verifyHmac(body, undefined, SECRET, 'base64')).toBe(false)
    expect(verifyHmac(Buffer.from('{"id":2}'), b64, SECRET, 'base64')).toBe(false)
  })
})

describe('InMemorySeenStore (idempotency)', () => {
  it('returns false first time, true on redelivery', async () => {
    const s = new InMemorySeenStore()
    expect(await s.seen('evt-1')).toBe(false)
    expect(await s.seen('evt-1')).toBe(true)
    expect(await s.seen('evt-2')).toBe(false)
  })
})

describe('TokenBucket (rate limiter)', () => {
  it('allows up to capacity, then refuses, then refills over time', () => {
    const t = new TokenBucket(2, 1, 0) // cap 2, 1/sec, t0=0
    expect(t.tryRemove(1, 0)).toBe(true)
    expect(t.tryRemove(1, 0)).toBe(true)
    expect(t.tryRemove(1, 0)).toBe(false) // empty
    expect(t.tryRemove(1, 1000)).toBe(true) // +1 token after 1s
  })
})

describe('withRetry (backoff)', () => {
  it('retries then succeeds', async () => {
    let n = 0
    const r = await withRetry(
      async () => {
        if (++n < 3) throw new Error('fail')
        return 'ok'
      },
      { retries: 5, baseMs: 1 },
    )
    expect(r).toBe('ok')
    expect(n).toBe(3)
  })
  it('throws after exhausting retries; respects retryable=false', async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error('boom')
        },
        { retries: 2, baseMs: 1 },
      ),
    ).rejects.toThrow('boom')
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error('nope')
        },
        { retries: 5, baseMs: 1, retryable: () => false },
      ),
    ).rejects.toThrow('nope')
    expect(calls).toBe(1) // non-retryable → tried once
  })
})

describe('runStreamSync (sync engine)', () => {
  it('loads cursor → pulls → publishes → advances cursor', async () => {
    const store = new Map<string, string>()
    const cursors: CursorStore = {
      get: async (k) => store.get(k),
      set: async (k, c) => void (c && store.set(k, c)),
    }
    const published: Array<{ provider: string; brandId: string; stream: string; records: unknown[] }> = []
    const publish: PullPublisher = {
      publish: (provider, brandId, stream, records) => void published.push({ provider, brandId, stream, records }),
    }
    const connector: ConnectorHooks = {
      manifest: {
        provider: 'fake',
        category: 'ads',
        tier: 1,
        auth: 'oauth2',
        ingest: ['pull'],
        streams: [{ name: 'ad_spend', mode: 'pull' }],
      },
      async pull(stream, cursor, _token) {
        expect(stream).toBe('ad_spend')
        expect(cursor).toBeUndefined() // first cycle
        return { records: [{ stream: 'ad_spend', data: { date: '2026-06-06', spend: 100 } }], nextCursor: '2026-06-07' }
      },
    }
    const r = await runStreamSync(connector, 'brand-1', 'ad_spend', { cursors, publish, accessToken: 'tok' })
    expect(r.count).toBe(1)
    expect(published).toHaveLength(1)
    expect(published[0].records).toHaveLength(1)
    expect(store.get('fake:brand-1:ad_spend')).toBe('2026-06-07') // cursor advanced
  })
})
