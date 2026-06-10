import { describe, expect, it } from 'vitest'
import { buildObjects, dtFromTimestamp, toLine, type RawMessage } from './archive'

const msg = (over: Partial<RawMessage>): RawMessage => ({
  topic: 'brain.integration.webhooks',
  partition: 0,
  offset: '41',
  key: 'b-1',
  timestamp: '1781136000000', // 2026-06-11T00:00:00.000Z
  value: '{"schema_version":"1","stream":"orders","payload":{"order_id":"5"}}',
  ...over,
})

describe('raw archive layout', () => {
  it('preserves the payload byte-exact through a line round-trip', () => {
    const original = '{"a":1, "weird":  "spacing"}' // formatting must survive
    const line = toLine(msg({ value: original }))
    expect(JSON.parse(line).value).toBe(original)
  })

  it('partitions objects by (topic, brand, day, kafka partition) with offset-range names', () => {
    const objects = buildObjects([
      msg({ offset: '41' }),
      msg({ offset: '42' }),
      msg({ offset: '7', key: 'b-2' }),
      msg({ offset: '9', topic: 'brain.integration.pull' }),
      msg({ offset: '3', timestamp: '1781222400000' }), // next day
    ])
    const keys = objects.map((o) => o.key).sort()
    expect(keys).toEqual([
      'brain.integration.pull/brand_id=b-1/dt=2026-06-11/0-9-9.jsonl',
      'brain.integration.webhooks/brand_id=b-1/dt=2026-06-11/0-41-42.jsonl',
      'brain.integration.webhooks/brand_id=b-1/dt=2026-06-12/0-3-3.jsonl',
      'brain.integration.webhooks/brand_id=b-2/dt=2026-06-11/0-7-7.jsonl',
    ])
    const two = objects.find((o) => o.key.includes('0-41-42'))!
    expect(two.count).toBe(2)
    expect(two.body.trimEnd().split('\n')).toHaveLength(2)
  })

  it('maps a missing key to unknown and a bad timestamp to the epoch sentinel day', () => {
    const [o] = buildObjects([msg({ key: null, timestamp: 'garbage' })])
    expect(o.key).toContain('brand_id=unknown')
    expect(dtFromTimestamp('garbage')).toBe('1970-01-01')
  })
})
