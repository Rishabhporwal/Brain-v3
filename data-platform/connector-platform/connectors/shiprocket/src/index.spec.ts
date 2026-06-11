import { describe, expect, it } from 'vitest'
import { mapShiprocketWebhook, verifyShiprocketWebhook } from './index'

describe('shiprocket verifyWebhook', () => {
  it('accepts the exact configured token and rejects everything else', () => {
    expect(verifyShiprocketWebhook('tok_123', 'tok_123')).toBe(true)
    expect(verifyShiprocketWebhook('tok_124', 'tok_123')).toBe(false)
    expect(verifyShiprocketWebhook(undefined, 'tok_123')).toBe(false)
    expect(verifyShiprocketWebhook('tok_123', '')).toBe(false)
  })
})

describe('shiprocket mapWebhook', () => {
  it('normalizes a status update to the canonical ShipmentRecord', () => {
    const payload = {
      awb: 141123456789,
      shipment_id: 401298765,
      order_id: 112233,
      channel_order_id: '#1001',
      current_status: 'Out For Delivery',
      courier_name: 'Delhivery',
      current_timestamp: '2026-06-11 09:30:00',
    }
    const mapped = mapShiprocketWebhook({ rawBody: Buffer.from(JSON.stringify(payload)), headers: {} })
    expect(mapped.topic).toBe('shipment.status')
    expect(mapped.records).toHaveLength(1)
    expect(mapped.records[0].primaryKey).toBe('401298765')
    expect(mapped.records[0].data).toMatchObject({
      shipment_id: '401298765',
      awb: '141123456789',
      order_ref: '#1001',
      status: 'out_for_delivery',
      courier: 'Delhivery',
    })
  })

  it('maps RTO and unknown statuses to stable lowercase keys', () => {
    const rto = mapShiprocketWebhook({
      rawBody: Buffer.from(JSON.stringify({ awb: '1', current_status: 'RTO Initiated' })),
      headers: {},
    })
    expect((rto.records[0].data as { status: string }).status).toBe('rto')
    const unknown = mapShiprocketWebhook({
      rawBody: Buffer.from(JSON.stringify({ awb: '1', current_status: 'Some New State' })),
      headers: {},
    })
    expect((unknown.records[0].data as { status: string }).status).toBe('some_new_state')
  })

  it('emits no records without a shipment identifier and survives bad JSON', () => {
    expect(mapShiprocketWebhook({ rawBody: Buffer.from('{}'), headers: {} }).records).toEqual([])
    expect(mapShiprocketWebhook({ rawBody: Buffer.from('not json'), headers: {} }).records).toEqual([])
  })
})
