import { describe, expect, it } from 'vitest'
import { decide } from './policy'

describe('consent decision policy', () => {
  it('granted allows, withdrawn denies — for every purpose', () => {
    for (const p of ['marketing', 'utility', 'authentication', 'analytics'] as const) {
      expect(decide(p, 'granted').allowed).toBe(true)
      expect(decide(p, 'withdrawn').allowed).toBe(false)
    }
  })

  it('FAILS CLOSED for marketing when no consent was ever collected', () => {
    const d = decide('marketing', null)
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('fail_closed_no_consent_for_marketing')
  })

  it('functional purposes stay permitted without a record', () => {
    expect(decide('utility', null).allowed).toBe(true)
    expect(decide('authentication', null).allowed).toBe(true)
  })

  it('analytics is allowed until an explicit withdrawal (capture is consent-stamped at source)', () => {
    expect(decide('analytics', null).allowed).toBe(true)
    expect(decide('analytics', 'withdrawn').allowed).toBe(false)
  })

  it('explicit not_collected behaves like absence', () => {
    expect(decide('marketing', 'not_collected').allowed).toBe(false)
  })
})
