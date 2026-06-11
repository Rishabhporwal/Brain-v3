/**
 * PURE consent decision policy (BRD §10.2/§27.4, DPDP/DLT/NCPR posture): the latest recorded
 * state wins; absence of a record FAILS CLOSED for marketing and ads, and stays permissive only
 * for strictly-functional purposes (utility/authentication). Analytics defaults to allowed until
 * a withdrawal is recorded (consent-mode style), because capture is consent-stamped at source.
 */

export type Channel = 'whatsapp' | 'email' | 'sms' | 'voice' | 'push' | 'ads' | 'chat' | 'ig_dm'
export type Purpose = 'marketing' | 'utility' | 'authentication' | 'analytics'
export type ConsentState = 'granted' | 'withdrawn' | 'not_collected'

export interface ConsentDecision {
  allowed: boolean
  state: ConsentState
  reason: string
}

export function decide(purpose: Purpose, latestState: ConsentState | null): ConsentDecision {
  const state = latestState ?? 'not_collected'

  if (state === 'granted') return { allowed: true, state, reason: 'granted' }
  if (state === 'withdrawn') return { allowed: false, state, reason: 'withdrawn' }

  // not_collected — the default posture is purpose-dependent:
  if (purpose === 'marketing' || channelIsOutboundMarketing(purpose)) {
    return { allowed: false, state, reason: 'fail_closed_no_consent_for_marketing' }
  }
  if (purpose === 'utility' || purpose === 'authentication') {
    return { allowed: true, state, reason: 'functional_purpose_permitted' }
  }
  // analytics
  return { allowed: true, state, reason: 'analytics_until_withdrawn' }
}

function channelIsOutboundMarketing(_purpose: Purpose): boolean {
  return false // purpose alone decides at v1; per-channel rules (DLT windows, quiet hours) live in the guardrail
}
