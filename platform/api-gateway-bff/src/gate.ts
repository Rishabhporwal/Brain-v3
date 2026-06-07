/**
 * Activation-gate decision (M2) — pure, so it's unit-testable without a DB. Hard criteria block
 * activation (tracking verified *with* real events; costs configured); soft criteria only warn.
 */
export interface GateSignals {
  trackingVerified: boolean
  events: number
  costsConfigured: boolean
  integrations: number
}

export interface GateDecision {
  ready: boolean
  failures: string[]
  warnings: string[]
}

export function evaluateGate(s: GateSignals): GateDecision {
  const failures: string[] = []
  if (!s.trackingVerified || s.events === 0) failures.push('Install and verify tracking (no events received yet).')
  if (!s.costsConfigured) failures.push('Configure your costs before activating.')

  const warnings: string[] = []
  if (s.integrations === 0) warnings.push('No integrations connected — you can add these later.')

  return { ready: failures.length === 0, failures, warnings }
}
