import { apiJson } from '@/lib/api/client'

/** The connector catalog (shared by onboarding + settings). `oauth` providers use the real connect flow. */
export const CONNECTORS = [
  { id: 'shopify', name: 'Shopify', category: 'Storefront', oauth: true },
  { id: 'google', name: 'Google Ads', category: 'Ads', oauth: true },
  { id: 'meta', name: 'Meta Ads', category: 'Ads', oauth: true },
  { id: 'shiprocket', name: 'Shiprocket', category: 'Logistics', oauth: false },
  { id: 'razorpay', name: 'Razorpay', category: 'Payments', oauth: false },
  { id: 'whatsapp', name: 'WhatsApp', category: 'Messaging', oauth: false },
] as const

export type Connector = (typeof CONNECTORS)[number]
export type ConnectResult = { mode: 'oauth'; url: string }
export type IntegrationRow = {
  provider: string
  status: string
  quality_level: string
  account: string | null
  last_sync_at: string | null
  completeness: number | null
}

/**
 * Ask the BFF to start a connection. Providers return a consent URL (the caller navigates the browser
 * to it); an unconfigured provider is a server error (501) — never a stub. `returnTo` is where the OAuth callback brings the browser
 * back (defaults server-side to /onboarding) — pass the current path from Settings.
 */
export function startConnect(
  slug: string,
  provider: string,
  opts: { shop?: string; returnTo?: string } = {},
): Promise<ConnectResult> {
  const p = new URLSearchParams()
  if (opts.shop) p.set('shop', opts.shop.trim())
  if (opts.returnTo) p.set('returnTo', opts.returnTo)
  const qs = p.toString() ? `?${p.toString()}` : ''
  return apiJson<ConnectResult>(`/api/workspaces/${slug}/integrations/${provider}/connect${qs}`)
}

export function listIntegrations(slug: string): Promise<IntegrationRow[]> {
  return apiJson<IntegrationRow[]>(`/api/workspaces/${slug}/integrations`)
}

export function disconnectIntegration(slug: string, provider: string): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>(`/api/workspaces/${slug}/integrations/${provider}/disconnect`, { method: 'POST' })
}
