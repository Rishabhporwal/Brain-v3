'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { IconCheck, IconCopy, IconLoader2 } from '@tabler/icons-react'
import { apiFetch, apiJson } from '@/lib/api/client'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Settings → Tracking. The first-party SDK home (moved out of onboarding): issue a write-key + snippet,
 * fire a test event, and verify against real ingested events. Wires the BFF tracking endpoints + /api/track.
 */
export function TrackingSettings() {
  const slug = useParams<{ slug: string }>().slug
  const [writeKey, setWriteKey] = useState<string>()
  const [snippet, setSnippet] = useState<string>()
  const [verified, setVerified] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!slug) return
    apiJson<{ writeKey: string; snippet: string }>(`/api/workspaces/${slug}/tracking`, { method: 'POST' })
      .then((r) => {
        setWriteKey(r.writeKey)
        setSnippet(r.snippet)
      })
      .catch(() => {})
  }, [slug])

  async function sendTestEvent() {
    if (!writeKey) return
    setBusy(true)
    try {
      const res = await apiFetch('/api/track', {
        method: 'POST',
        headers: { 'x-brain-key': writeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'page_view', source: 'settings_test', props: { path: '/settings/tracking' } }),
      })
      if (res.ok) toast.success('Test event sent — now verify')
      else toast.error('Could not send the test event')
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setBusy(true)
    try {
      const r = await apiJson<{ verified: boolean; events: number }>(`/api/workspaces/${slug}/tracking/verify`, {
        method: 'POST',
      })
      if (r.verified) {
        setVerified(true)
        toast.success(`Verified — ${r.events} event${r.events === 1 ? '' : 's'} received`)
      } else toast.error('No events yet. Install the snippet or send a test event, then verify.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Tracking" description="Install the first-party SDK and verify events flow." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Install snippet</CardTitle>
          <CardDescription>
            Add this to your store&apos;s {'<head>'} to start collecting first-party events.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="bg-muted relative rounded-md p-3">
            <code className="block overflow-x-auto text-xs break-all whitespace-pre-wrap">
              {snippet ?? 'Issuing your write-key…'}
            </code>
            {snippet ? (
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-1 right-1"
                onClick={() => {
                  navigator.clipboard.writeText(snippet)
                  toast.success('Copied')
                }}
              >
                <IconCopy className="size-4" />
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {verified ? (
              <Badge variant="outline" className="gap-1">
                <IconCheck className="size-3.5" /> Verified
              </Badge>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={verify} disabled={busy || !writeKey}>
                  {busy ? <IconLoader2 className="size-4 animate-spin" /> : null} Verify installation
                </Button>
                <Button variant="ghost" size="sm" onClick={sendTestEvent} disabled={busy || !writeKey}>
                  Send a test event
                </Button>
              </>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Haven&apos;t added the snippet yet? Send a test event to confirm the pipeline, then verify.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
