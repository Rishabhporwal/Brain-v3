'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { IconLoader2 } from '@tabler/icons-react'
import { apiJson } from '@/lib/api/client'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Costs = { cogsPct: number; shippingMinor: number; codFeeMinor: number; gatewayPct: number }

/** Settings → Costs. The COGS/fees behind contribution margin (moved out of onboarding). */
export function CostsSettings() {
  const slug = useParams<{ slug: string }>().slug
  const [form, setForm] = useState({ cogsPct: '', shipping: '', codFee: '', gatewayPct: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!slug) return
    apiJson<Costs>(`/api/workspaces/${slug}/costs`)
      .then((c) =>
        setForm({
          cogsPct: String(c.cogsPct ?? 0),
          shipping: String((c.shippingMinor ?? 0) / 100),
          codFee: String((c.codFeeMinor ?? 0) / 100),
          gatewayPct: String(c.gatewayPct ?? 0),
        }),
      )
      .catch(() => {})
  }, [slug])

  async function save() {
    setBusy(true)
    try {
      await apiJson(`/api/workspaces/${slug}/costs`, {
        method: 'POST',
        body: JSON.stringify({
          cogsPct: Number(form.cogsPct),
          shippingMinor: Math.round(Number(form.shipping) * 100),
          codFeeMinor: Math.round(Number(form.codFee) * 100),
          gatewayPct: Number(form.gatewayPct),
        }),
      })
      toast.success('Costs saved')
    } catch {
      toast.error('Could not save costs')
    } finally {
      setBusy(false)
    }
  }

  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Costs" description="COGS, fees, shipping and COD that drive honest contribution margin." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost configuration</CardTitle>
          <CardDescription>Set the costs behind contribution margin.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cogs">COGS (% of revenue)</Label>
              <Input id="cogs" inputMode="decimal" value={form.cogsPct} onChange={(e) => set({ cogsPct: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ship">Forward shipping</Label>
              <Input id="ship" inputMode="decimal" value={form.shipping} onChange={(e) => set({ shipping: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cod">COD fee</Label>
              <Input id="cod" inputMode="decimal" value={form.codFee} onChange={(e) => set({ codFee: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gw">Gateway fee (%)</Label>
              <Input id="gw" inputMode="decimal" value={form.gatewayPct} onChange={(e) => set({ gatewayPct: e.target.value })} />
            </div>
          </div>
          <div>
            <Button onClick={save} disabled={busy}>
              {busy ? <IconLoader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Save costs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
