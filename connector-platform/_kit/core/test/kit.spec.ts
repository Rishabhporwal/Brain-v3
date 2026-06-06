import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { InMemorySeenStore, safeReturnTo, signOAuthState, verifyHmac, verifyOAuthState } from '../src/index'

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
    expect(() => verifyOAuthState(SECRET, signOAuthState(SECRET, { provider: 'p', brandId: 'b', exp: 1 }))).toThrow(/expired/)
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
