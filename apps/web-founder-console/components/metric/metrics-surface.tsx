'use client'

import { useWorkspace } from '@/lib/workspace'
import { useSurfaceData } from '@/lib/api/use-surface-data'
import type { MetricId } from '@/lib/metrics/registry'
import { sampleSummary } from '@/lib/metrics/sample'
import { PageHeader } from '@/components/layout/page-header'
import { KpiGrid } from '@/components/metric/kpi-grid'
import { DataPanel } from '@/components/layout/data-panel'
import { SurfaceDetail } from '@/components/metric/surface-detail'
import type { SurfaceSummary } from '@/components/metric/surface-types'

export type { SurfaceSummary }

/**
 * The standard metrics surface: header + registry-driven KPI grid + a primary detail panel.
 * Every analytics surface composes this so behaviour (data hook, gating-aware currency, loading/empty/error)
 * is identical. Surfaces that need a bespoke table/chart pass it as `detail`.
 */
export function MetricsSurface({
  surface,
  title,
  description,
  metrics,
  detailTitle,
  detailDescription,
  detail,
  endpoint,
}: {
  surface: string
  title: string
  description?: string
  metrics: MetricId[]
  detailTitle: string
  detailDescription?: string
  detail?: React.ReactNode
  /** Override the BFF path; defaults to /api/workspaces/:slug/:surface/summary. */
  endpoint?: (slug: string) => string
}) {
  const { current } = useWorkspace()
  const { slug, currency } = current
  const path = endpoint ? endpoint(slug) : `/api/workspaces/${slug}/${surface}/summary`

  const q = useSurfaceData<SurfaceSummary>([surface, 'summary', slug], path, sampleSummary(metrics))

  const resolvedDetail = detail ?? <SurfaceDetail surface={surface} currency={currency} />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={title} description={description} asOf={q.data?.asOf} />
      <KpiGrid
        metrics={metrics}
        data={q.data?.metrics}
        deltas={q.data?.deltas}
        currency={currency}
        loading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        isRetrying={q.isFetching}
      />
      <DataPanel
        title={detailTitle}
        description={detailDescription}
        loading={q.isLoading}
        isError={q.isError}
        isEmpty={!q.isLoading && !q.isError && !resolvedDetail}
        onRetry={() => q.refetch()}
        isRetrying={q.isFetching}
      >
        {resolvedDetail}
      </DataPanel>
    </div>
  )
}
