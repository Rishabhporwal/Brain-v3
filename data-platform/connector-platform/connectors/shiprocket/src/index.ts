import { timingSafeEqual } from 'node:crypto'
import {
  type ConnectorHooks,
  type ConnectorManifest,
  type ShipmentRecord,
  type WebhookContext,
  type WebhookMapped,
} from '@brain/connector-kit'

/**
 * Shiprocket connector (push lane, logistics). Shiprocket webhooks don't sign the body — the panel lets
 * the merchant set a static token sent on every delivery (`x-api-key`); verification is a timing-safe
 * token comparison. Status updates are normalized to the canonical ShipmentRecord on the `shipments`
 * stream. Webhooks carry no brand → the receiver resolves the brand from the URL path (like Razorpay).
 */
export const SHIPROCKET_MANIFEST: ConnectorManifest = {
  provider: 'shiprocket',
  category: 'logistics',
  tier: 3,
  auth: 'apikey',
  ingest: ['push'],
  streams: [{ name: 'shipments', mode: 'push', primaryKey: 'shipment_id' }],
  backfill: 'none',
}

/** Canonical status map — Shiprocket sends display-cased statuses; downstream wants stable lowercase keys. */
const STATUS_MAP: Record<string, string> = {
  'pickup scheduled': 'pickup_scheduled',
  'pickup generated': 'pickup_scheduled',
  'picked up': 'picked_up',
  shipped: 'in_transit',
  'in transit': 'in_transit',
  'out for delivery': 'out_for_delivery',
  delivered: 'delivered',
  undelivered: 'undelivered',
  'rto initiated': 'rto',
  'rto delivered': 'rto_delivered',
  cancelled: 'cancelled',
  lost: 'lost',
}

interface ShiprocketPayload {
  awb?: string | number
  shipment_id?: string | number
  order_id?: string | number
  channel_order_id?: string | number
  current_status?: string
  shipment_status?: string
  courier_name?: string
  current_timestamp?: string
  scans?: Array<{ date?: string }>
}

function normalizeShipment(p: ShiprocketPayload): ShipmentRecord {
  const raw = (p.current_status ?? p.shipment_status ?? '').trim()
  return {
    shipment_id: String(p.shipment_id ?? p.awb ?? ''),
    awb: String(p.awb ?? ''),
    order_ref: String(p.channel_order_id ?? p.order_id ?? ''),
    status: STATUS_MAP[raw.toLowerCase()] ?? raw.toLowerCase().replace(/\s+/g, '_'),
    courier: p.courier_name ?? '',
    updated_at: p.current_timestamp ? new Date(p.current_timestamp).toISOString() : '',
  }
}

/** Timing-safe comparison of the panel-configured webhook token (`x-api-key`). */
export function verifyShiprocketWebhook(header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false
  const a = Buffer.from(header)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function mapShiprocketWebhook(ctx: WebhookContext): WebhookMapped {
  let body: ShiprocketPayload = {}
  try {
    body = ctx.rawBody.length ? JSON.parse(ctx.rawBody.toString('utf8')) : {}
  } catch {
    body = {}
  }
  const record = normalizeShipment(body)
  const records = record.shipment_id ? [{ stream: 'shipments', primaryKey: record.shipment_id, data: record }] : []
  return { topic: 'shipment.status', records }
}

export const shiprocket: ConnectorHooks = {
  manifest: SHIPROCKET_MANIFEST,
  verifyWebhook: (ctx, secret) => verifyShiprocketWebhook(ctx.headers['x-api-key'], secret),
  mapWebhook: mapShiprocketWebhook,
}
