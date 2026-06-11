import {
  EventQueue,
  buildEvent,
  rollSession,
  shouldCapture,
  type ConsentState,
  type SdkState,
  type TrackEvent,
} from './core'

export interface BrainTrackerOptions {
  writeKey: string
  endpoint?: string // default '/api/track' (first-party proxy route)
  flushIntervalMs?: number
}

/**
 * Browser tracker — thin adapter over the tested core: localStorage anonymous id, rolling
 * session, consent-aware capture, batched delivery (interval + pagehide sendBeacon so the tail
 * of a visit survives navigation). Write-key auth via x-brain-key; never cookies, never PII in
 * the envelope beyond what the page explicitly passes.
 */
export class BrainTracker {
  private state: SdkState
  private readonly queue = new EventQueue()
  private readonly endpoint: string
  private timer?: ReturnType<typeof setInterval>

  constructor(private readonly opts: BrainTrackerOptions) {
    this.endpoint = opts.endpoint ?? '/api/track'
    this.state = {
      anonymousId: this.persistent('brain_anon_id', () => crypto.randomUUID()),
      consent: (localStorage.getItem('brain_consent') as ConsentState) ?? 'not_collected',
      session: { id: crypto.randomUUID(), lastActivityMs: Date.now() },
    }
    this.timer = setInterval(() => void this.flush(), opts.flushIntervalMs ?? 5_000)
    addEventListener('pagehide', () => this.flush(true))
  }

  /** Read-or-create a localStorage-persisted value (the durable anonymous id). */
  private persistent(key: string, create: () => string): string {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const value = create()
    localStorage.setItem(key, value)
    return value
  }

  track(event: string, props: Record<string, unknown> = {}): void {
    if (!shouldCapture(this.state.consent, event)) return
    this.state = rollSession(this.state, Date.now(), () => crypto.randomUUID())
    this.queue.push(buildEvent(this.state, event, props, new Date().toISOString()))
  }

  page(name?: string): void {
    this.track('page_view', { name: name ?? document.title, path: location.pathname, referrer: document.referrer })
  }

  identify(customerId: string): void {
    this.state = { ...this.state, customerId }
  }

  /** Record a consent change — stamped on every subsequent event AND sent as its own event. */
  consent(state: ConsentState): void {
    this.state = { ...this.state, consent: state }
    localStorage.setItem('brain_consent', state)
    this.queue.push(buildEvent(this.state, 'consent_changed', { to: state }, new Date().toISOString()))
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer)
    void this.flush(true)
  }

  private async flush(useBeacon = false): Promise<void> {
    for (let batch = this.queue.drain(); batch.length > 0; batch = this.queue.drain()) {
      for (const e of batch) await this.send(e, useBeacon)
    }
  }

  private async send(e: TrackEvent, useBeacon: boolean): Promise<void> {
    const body = JSON.stringify({ ...e, writeKey: this.opts.writeKey })
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(this.endpoint, new Blob([body], { type: 'application/json' }))
      return
    }
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-brain-key': this.opts.writeKey },
        body,
        keepalive: true,
      })
    } catch {
      // delivery is best-effort; the queue already drained — never block or break the page
    }
  }
}

export type { ConsentState, TrackEvent }
