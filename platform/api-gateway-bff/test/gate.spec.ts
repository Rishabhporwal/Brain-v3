import { describe, expect, it } from 'vitest'
import { evaluateGate } from '../src/gate'

// M6 — unit coverage for the M2 activation gate (hard vs soft criteria).
describe('evaluateGate', () => {
  const ok = { trackingVerified: true, events: 3, costsConfigured: true, integrations: 1 }

  it('is ready when both hard criteria pass', () => {
    const d = evaluateGate(ok)
    expect(d.ready).toBe(true)
    expect(d.failures).toEqual([])
    expect(d.warnings).toEqual([])
  })

  it('blocks when tracking is verified but no events have arrived', () => {
    const d = evaluateGate({ ...ok, events: 0 })
    expect(d.ready).toBe(false)
    expect(d.failures).toContain('Install and verify tracking (no events received yet).')
  })

  it('blocks when tracking is not verified even if events exist', () => {
    const d = evaluateGate({ ...ok, trackingVerified: false })
    expect(d.ready).toBe(false)
    expect(d.failures.some((f) => f.includes('verify tracking'))).toBe(true)
  })

  it('blocks when costs are not configured', () => {
    const d = evaluateGate({ ...ok, costsConfigured: false })
    expect(d.ready).toBe(false)
    expect(d.failures).toContain('Configure your costs before activating.')
  })

  it('lists every failed hard criterion at once', () => {
    const d = evaluateGate({ trackingVerified: false, events: 0, costsConfigured: false, integrations: 0 })
    expect(d.ready).toBe(false)
    expect(d.failures).toHaveLength(2)
  })

  it('treats zero integrations as a soft warning, not a blocker', () => {
    const d = evaluateGate({ ...ok, integrations: 0 })
    expect(d.ready).toBe(true) // still activatable
    expect(d.failures).toEqual([])
    expect(d.warnings).toContain('No integrations connected — you can add these later.')
  })
})
