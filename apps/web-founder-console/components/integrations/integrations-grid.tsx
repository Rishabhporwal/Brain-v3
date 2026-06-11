'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { IconCheck, IconLoader2 } from '@tabler/icons-react'
import { ApiError } from '@/lib/api/types'
import {
  CONNECTORS,
  disconnectIntegration,
  listIntegrations,
  startConnect,
  type IntegrationRow,
} from '@/lib/integrations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type RowMap = Record<string, IntegrationRow> // provider → row

export function IntegrationsGrid() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const [rows, setRows] = useState<RowMap>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [needShop, setNeedShop] = useState(false)
  const [shop, setShop] = useState('')

  const refresh = useCallback(async () => {
    if (!slug) return
    try {
      const list: IntegrationRow[] = await listIntegrations(slug)
      setRows(Object.fromEntries(list.map((r) => [r.provider, r])))
    } catch {
      /* unauthenticated / not provisioned — leave empty */
    }
  }, [slug])

  // Initial load + handle the OAuth return (?connected / ?connect_error) for this Settings surface.
  useEffect(() => {
    const url = new URL(window.location.href)
    const connected = url.searchParams.get('connected')
    const err = url.searchParams.get('connect_error')
    if (connected) toast.success(`${connected[0].toUpperCase()}${connected.slice(1)} connected`)
    if (err) toast.error(`Couldn't connect: ${err.replace(/_/g, ' ')}`)
    if (connected || err) {
      url.searchParams.delete('connected')
      url.searchParams.delete('connect_error')
      window.history.replaceState({}, '', url.pathname)
    }
    void refresh()
  }, [refresh])

  async function connect(provider: string, shopDomain?: string) {
    if (!slug) return
    setBusy(provider)
    try {
      const r = await startConnect(slug, provider, { shop: shopDomain, returnTo: window.location.pathname })
      if (r.mode === 'oauth') {
        window.location.href = r.url // off to the provider's consent screen; we return via the callback
        return
      }
      setNeedShop(false)
      toast.success('Connected')
      await refresh()
    } catch (e) {
      if (provider === 'shopify' && e instanceof ApiError && e.status === 400) {
        setNeedShop(true) // Shopify is configured but needs the store domain
        return
      }
      toast.error('Could not start the connection')
    } finally {
      setBusy(null)
    }
  }

  async function disconnect(provider: string) {
    if (!slug) return
    setBusy(provider)
    try {
      await disconnectIntegration(slug, provider)
      toast.success('Disconnected')
      await refresh()
    } catch {
      toast.error('Could not disconnect')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CONNECTORS.map((c) => {
        const row = rows[c.id]
        const s = row?.status
        const isConnected = s === 'connected'
        const label = isConnected ? 'Connected' : s === 'degraded' ? 'Degraded' : 'Not connected'
        const variant = isConnected ? 'outline' : s === 'degraded' ? 'destructive' : 'secondary'
        return (
          <Card key={c.id}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-muted-foreground text-xs">{c.category}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={variant} className="gap-1">
                    {isConnected ? <IconCheck className="size-3.5" /> : null}
                    {label}
                  </Badge>
                  {c.oauth ? (
                    <Button
                      size="sm"
                      variant={isConnected ? 'outline' : 'default'}
                      onClick={() => connect(c.id)}
                      disabled={busy !== null}
                    >
                      {busy === c.id ? <IconLoader2 className="size-4 animate-spin" /> : null}
                      {isConnected ? 'Reconnect' : 'Connect'}
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" disabled>
                      Soon
                    </Button>
                  )}
                </div>
              </div>
              {/* Account detail + sync/health + disconnect, when connected */}
              {isConnected ? (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="text-muted-foreground space-y-0.5">
                    {row?.account ? <div>{row.account}</div> : null}
                    <div>
                      {row?.last_sync_at ? `Last sync ${new Date(row.last_sync_at).toLocaleString()}` : 'No sync yet'}
                      {row?.completeness != null ? ` · ${Math.round(Number(row.completeness))}% complete` : ''}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive h-7"
                    onClick={() => disconnect(c.id)}
                    disabled={busy !== null}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : null}
              {c.id === 'shopify' && needShop && !isConnected ? (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="your-store.myshopify.com"
                    value={shop}
                    onChange={(e) => setShop(e.target.value)}
                    className="h-8"
                  />
                  <Button size="sm" onClick={() => connect('shopify', shop)} disabled={busy !== null || !shop.trim()}>
                    Continue
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
