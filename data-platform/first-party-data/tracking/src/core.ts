/**
 * DOM-free SDK core (unit-tested): identity, sessionization, consent stamping, and the event
 * queue/batcher. The browser adapter (browser.ts) wires storage + transport around this. The
 * envelope matches the BFF /track contract exactly (write-key auth, consent-aware at capture —
 * BRD §10.2/§10.3).
 */

export type ConsentState = 'granted' | 'withdrawn' | 'not_collected'

export interface TrackEvent {
  event: string
  props: Record<string, unknown>
  anonymousId: string
  sessionId: string
  customerId?: string
  consent: ConsentState
  source: 'sdk'
  sentAt: string
}

export interface SdkState {
  anonymousId: string
  customerId?: string
  consent: ConsentState
  session: { id: string; lastActivityMs: number }
}

export const SESSION_IDLE_MS = 30 * 60 * 1000 // industry-standard 30-min rolling session

/** Roll the session: same id while active, a fresh one after the idle window. Pure. */
export function rollSession(state: SdkState, nowMs: number, newId: () => string): SdkState {
  const expired = nowMs - state.session.lastActivityMs > SESSION_IDLE_MS
  return {
    ...state,
    session: { id: expired ? newId() : state.session.id, lastActivityMs: nowMs },
  }
}

/** Build one wire event from SDK state. Consent is stamped AT CAPTURE, never inferred later. */
export function buildEvent(state: SdkState, event: string, props: Record<string, unknown>, nowIso: string): TrackEvent {
  return {
    event,
    props,
    anonymousId: state.anonymousId,
    sessionId: state.session.id,
    ...(state.customerId ? { customerId: state.customerId } : {}),
    consent: state.consent,
    source: 'sdk',
    sentAt: nowIso,
  }
}

/** Bounded FIFO queue with batch draining — drops oldest on overflow (never blocks the page). */
export class EventQueue {
  private readonly items: TrackEvent[] = []
  constructor(
    private readonly maxSize = 100,
    private readonly batchSize = 20,
  ) {}

  push(e: TrackEvent): void {
    if (this.items.length >= this.maxSize) this.items.shift()
    this.items.push(e)
  }

  /** Drain up to one batch; returns [] when empty. */
  drain(): TrackEvent[] {
    return this.items.splice(0, this.batchSize)
  }

  get size(): number {
    return this.items.length
  }
}

/** Withdrawn consent: analytics events still flow (stamped withdrawn) ONLY if the brand allows;
 *  default policy is to drop everything except strictly-functional events. Pure decision. */
export function shouldCapture(consent: ConsentState, event: string): boolean {
  if (consent !== 'withdrawn') return true
  return event === 'consent_changed' // the withdrawal itself must be recordable
}
