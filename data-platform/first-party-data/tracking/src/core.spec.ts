import { describe, expect, it } from 'vitest'
import { EventQueue, SESSION_IDLE_MS, buildEvent, rollSession, shouldCapture, type SdkState } from './core'

const state: SdkState = {
  anonymousId: 'anon-1',
  consent: 'granted',
  session: { id: 's-1', lastActivityMs: 1_000_000 },
}

describe('sessionization', () => {
  it('keeps the session id while active', () => {
    const next = rollSession(state, 1_000_000 + SESSION_IDLE_MS, () => 's-2')
    expect(next.session.id).toBe('s-1')
  })

  it('rolls a fresh session after the idle window', () => {
    const next = rollSession(state, 1_000_000 + SESSION_IDLE_MS + 1, () => 's-2')
    expect(next.session.id).toBe('s-2')
  })
})

describe('event envelope (matches the BFF /track contract)', () => {
  it('stamps identity, session, and consent at capture', () => {
    const e = buildEvent({ ...state, customerId: 'c-9' }, 'purchase', { value: '1499.00' }, '2026-06-11T10:00:00Z')
    expect(e).toEqual({
      event: 'purchase',
      props: { value: '1499.00' },
      anonymousId: 'anon-1',
      sessionId: 's-1',
      customerId: 'c-9',
      consent: 'granted',
      source: 'sdk',
      sentAt: '2026-06-11T10:00:00Z',
    })
  })

  it('omits customerId for anonymous visitors', () => {
    expect('customerId' in buildEvent(state, 'page_view', {}, 'now')).toBe(false)
  })
})

describe('queue', () => {
  it('drains in batches and drops oldest on overflow', () => {
    const q = new EventQueue(3, 2)
    for (let i = 1; i <= 4; i++) q.push(buildEvent(state, `e${i}`, {}, 'now'))
    expect(q.size).toBe(3) // e1 dropped
    const batch = q.drain()
    expect(batch.map((e) => e.event)).toEqual(['e2', 'e3'])
    expect(q.size).toBe(1)
  })
})

describe('consent gating at capture (BRD §10.2)', () => {
  it('captures normally when granted or not collected', () => {
    expect(shouldCapture('granted', 'page_view')).toBe(true)
    expect(shouldCapture('not_collected', 'page_view')).toBe(true)
  })

  it('drops events after withdrawal except the withdrawal record itself', () => {
    expect(shouldCapture('withdrawn', 'page_view')).toBe(false)
    expect(shouldCapture('withdrawn', 'purchase')).toBe(false)
    expect(shouldCapture('withdrawn', 'consent_changed')).toBe(true)
  })
})
