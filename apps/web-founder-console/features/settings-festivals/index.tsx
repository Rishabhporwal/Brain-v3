'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiJson } from '@/lib/api/client'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Festival = { date: string; name: string; multiplier: number }

/** Settings → Festivals. The region's festival & sale calendar with expected lift multipliers. */
export function FestivalsSettings() {
  const slug = useParams<{ slug: string }>().slug
  const [festivals, setFestivals] = useState<Festival[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!slug) return
    apiJson<Festival[]>(`/api/workspaces/${slug}/festivals`)
      .then(setFestivals)
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [slug])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Festivals" description="Festival & sale calendar with expected lift multipliers." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Festival calendar</CardTitle>
          <CardDescription>Upcoming festivals and sale windows for your region.</CardDescription>
        </CardHeader>
        <CardContent>
          {festivals.length === 0 ? (
            <p className="text-muted-foreground text-sm">{loaded ? 'No festivals for your region yet.' : 'Loading…'}</p>
          ) : (
            <ul className="divide-border divide-y">
              {festivals.map((f) => (
                <li key={`${f.date}-${f.name}`} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium">{f.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {new Date(f.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                  <Badge variant="outline">{Number(f.multiplier).toFixed(1)}× lift</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
