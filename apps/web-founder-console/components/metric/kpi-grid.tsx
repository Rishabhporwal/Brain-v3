'use client'

import { IconAlertTriangle } from '@tabler/icons-react'
import type { CurrencyCode } from '@/lib/format'
import { METRICS, type MetricDef, type MetricId, formatMetric } from '@/lib/metrics/registry'
import { Button } from '@/components/ui/button'
import { KpiCard } from '@/components/metric/kpi-card'

/** A registry-driven grid of KPI cards. Shared by every surface so KPIs render identically everywhere. */
export function KpiGrid({
  metrics,
  data,
  deltas,
  currency,
  loading,
  isError,
  onRetry,
  isRetrying,
  columns = 4,
}: {
  metrics: MetricId[]
  data?: Partial<Record<MetricId, number>>
  deltas?: Partial<Record<MetricId, number>>
  currency: CurrencyCode
  loading?: boolean
  isError?: boolean
  onRetry?: () => void
  isRetrying?: boolean
  columns?: 2 | 3 | 4
}) {
  if (isError) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <IconAlertTriangle className="size-6" />
        <p className="text-foreground text-sm font-medium">Couldn&apos;t load these metrics</p>
        <p className="text-sm">The service isn&apos;t reachable yet. Connect the backend, then retry.</p>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? 'Retrying…' : 'Retry'}
          </Button>
        ) : null}
      </div>
    )
  }
  const cols = columns === 2 ? 'lg:grid-cols-2' : columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cols}`}>
      {metrics.map((id) => {
        const def: MetricDef = METRICS[id]
        const raw = data?.[id]
        return (
          <KpiCard
            key={id}
            label={def.label}
            help={def.help}
            loading={loading}
            value={typeof raw === 'number' ? formatMetric(def.format, raw, currency) : '—'}
            delta={deltas?.[id]}
          />
        )
      })}
    </div>
  )
}
