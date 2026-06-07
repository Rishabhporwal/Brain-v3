import type { ConnectorManifest } from '@brain/connector-kit'
import { SHOPIFY_MANIFEST } from '@brain/connector-shopify'
import { GOOGLE_ADS_MANIFEST } from '@brain/connector-google-ads'
import { META_ADS_MANIFEST } from '@brain/connector-meta-ads'
import { WOOCOMMERCE_MANIFEST } from '@brain/connector-woocommerce'
import { RAZORPAY_MANIFEST } from '@brain/connector-razorpay'

/**
 * The connector catalog. Today: the manifests that are implemented; the rest are declared so the connect
 * surface + roadmap stay in sync. As each connector package lands, swap its `planned` entry for its imported
 * manifest. Per-brand connection state (tokens, cursors, health) lives in the `integration.*` Postgres tables.
 */
type CatalogEntry =
  | { status: 'live'; manifest: ConnectorManifest }
  | { status: 'planned'; provider: string; category: string; auth: ConnectorManifest['auth']; ingest: ConnectorManifest['ingest']; tier: 1 | 2 | 3 }

export const CONNECTOR_CATALOG: CatalogEntry[] = [
  { status: 'live', manifest: SHOPIFY_MANIFEST },
  { status: 'live', manifest: GOOGLE_ADS_MANIFEST },
  { status: 'live', manifest: META_ADS_MANIFEST },
  { status: 'live', manifest: WOOCOMMERCE_MANIFEST },
  { status: 'live', manifest: RAZORPAY_MANIFEST },
  { status: 'planned', provider: 'stripe', category: 'payments', auth: 'apikey', ingest: ['push'], tier: 2 },
  { status: 'planned', provider: 'shiprocket', category: 'logistics', auth: 'apikey', ingest: ['push', 'pull'], tier: 3 },
  { status: 'planned', provider: 'whatsapp', category: 'messaging', auth: 'apikey', ingest: ['push'], tier: 3 },
]

export const liveConnectors = (): ConnectorManifest[] =>
  CONNECTOR_CATALOG.filter((e): e is Extract<CatalogEntry, { status: 'live' }> => e.status === 'live').map((e) => e.manifest)

export const connectorProviders = (): string[] =>
  CONNECTOR_CATALOG.map((e) => (e.status === 'live' ? e.manifest.provider : e.provider))
