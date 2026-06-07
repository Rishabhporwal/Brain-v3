import { describe, expect, it } from 'vitest'
import { signOAuthState, verifyOAuthState } from '../src/oauth-state'

// Shared signed-state CSRF helper used by Google/Meta (and conceptually mirrors Shopify's).
const SECRET = 'state-secret'

describe('oauth-state', () => {
  it('round-trips a valid, unexpired state', () => {
    const exp = Math.floor(Date.now() / 1000) + 600
    const token = signOAuthState(SECRET, { provider: 'google', brandId: 'b1', exp })
    const decoded = verifyOAuthState(SECRET, token)
    expect(decoded.provider).toBe('google')
    expect(decoded.brandId).toBe('b1')
  })

  it('rejects a tampered signature', () => {
    const exp = Math.floor(Date.now() / 1000) + 600
    const token = signOAuthState(SECRET, { provider: 'meta', brandId: 'b', exp })
    expect(() => verifyOAuthState(SECRET, `${token.slice(0, -2)}xx`)).toThrow()
  })

  it('rejects a state signed with a different secret', () => {
    const exp = Math.floor(Date.now() / 1000) + 600
    const token = signOAuthState('other-secret', { provider: 'google', brandId: 'b', exp })
    expect(() => verifyOAuthState(SECRET, token)).toThrow(/signature/)
  })

  it('rejects an expired state', () => {
    const token = signOAuthState(SECRET, { provider: 'google', brandId: 'b', exp: Math.floor(Date.now() / 1000) - 1 })
    expect(() => verifyOAuthState(SECRET, token)).toThrow(/expired/)
  })

  it('rejects malformed input', () => {
    expect(() => verifyOAuthState(SECRET, 'garbage')).toThrow()
    expect(() => verifyOAuthState(SECRET, '')).toThrow()
  })
})
