// DOMAIN — pure business core. NO framework imports (no @nestjs/*, no pg, no kafka).
// An aggregate root: enforces its own invariants; the rest of the system can only
// change it through its methods. Money is integer-minor (Blueprint §2 — no floats).

import { WidgetCreated } from '../events/widget-created.event'
import { InvalidWidgetName, WidgetAlreadyArchived } from '../errors/widget.errors'

export type WidgetId = string // UUID v7
export type BrandId = string

export class Widget {
  private _events: WidgetCreated[] = []

  private constructor(
    public readonly id: WidgetId,
    public readonly brandId: BrandId,
    private _name: string,
    private _priceMinor: number,
    private _archived: boolean,
    public readonly createdAt: Date,
  ) {}

  /** Factory — the ONLY way a valid Widget comes into existence. Raises a domain event. */
  static create(input: { id: WidgetId; brandId: BrandId; name: string; priceMinor: number; now: Date }): Widget {
    if (!input.name || input.name.trim().length < 2) throw new InvalidWidgetName(input.name)
    const w = new Widget(
      input.id,
      input.brandId,
      input.name.trim(),
      Math.max(0, Math.trunc(input.priceMinor)),
      false,
      input.now,
    )
    w._events.push(new WidgetCreated(w.id, w.brandId, w._name, w._priceMinor, input.now))
    return w
  }

  /** Rehydrate from persistence — no invariants re-run, no events raised. */
  static rehydrate(row: {
    id: WidgetId
    brandId: BrandId
    name: string
    priceMinor: number
    archived: boolean
    createdAt: Date
  }): Widget {
    return new Widget(row.id, row.brandId, row.name, row.priceMinor, row.archived, row.createdAt)
  }

  archive(): void {
    if (this._archived) throw new WidgetAlreadyArchived(this.id)
    this._archived = true
  }

  get name() {
    return this._name
  }
  get priceMinor() {
    return this._priceMinor
  }
  get archived() {
    return this._archived
  }

  /** Drain domain events for the application layer to publish after commit. */
  pullEvents(): WidgetCreated[] {
    const e = this._events
    this._events = []
    return e
  }
}
