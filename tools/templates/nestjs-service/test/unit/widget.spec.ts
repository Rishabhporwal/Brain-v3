// UNIT — domain is pure, so it tests with no mocks, no I/O. Fast, deterministic.
import { describe, it, expect } from 'vitest'
import { Widget } from '../../src/domain/model/widget'
import { InvalidWidgetName, WidgetAlreadyArchived } from '../../src/domain/errors/widget.errors'

describe('Widget aggregate', () => {
  const make = () => Widget.create({ id: 'w1', brandId: 'b1', name: 'Sticker Pack', priceMinor: 4999, now: new Date() })
  it('creates a valid widget and raises a domain event', () => {
    const w = make()
    expect(w.priceMinor).toBe(4999)
    expect(w.pullEvents()).toHaveLength(1)
  })
  it('rejects an invalid name', () => {
    expect(() => Widget.create({ id: 'w', brandId: 'b', name: 'x', priceMinor: 1, now: new Date() })).toThrow(InvalidWidgetName)
  })
  it('forbids double-archive (invariant)', () => {
    const w = make(); w.archive()
    expect(() => w.archive()).toThrow(WidgetAlreadyArchived)
  })
})
