'use client'

import { useWorkspace } from '@/lib/workspace'
import { useSurfaceData } from '@/lib/api/use-surface-data'
import type { MetricId } from '@/lib/metrics/registry'
import { sampleSummary } from '@/lib/metrics/sample'
import type { SurfaceSummary } from '@/components/metric/surface-types'
import { PageHeader } from '@/components/layout/page-header'
import { KpiGrid } from '@/components/metric/kpi-grid'
import { TimeSeriesChart } from '@/components/charts/time-series-chart'
import { sampleTimeSeries } from '@/lib/charts/sample-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const KPI_ORDER: MetricId[] = ['realized_revenue', 'cm2', 'cm2_margin', 'orders', 'aov', 'mer', 'rto_rate', 'cod_share']

export function Dashboard() {
  const { current } = useWorkspace()
  const { slug, currency } = current

  const q = useSurfaceData<SurfaceSummary>(
    ['dashboard', 'summary', slug],
    `/api/workspaces/${slug}/dashboard/summary`,
    sampleSummary(KPI_ORDER),
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Command Center"
        description={`Today's revenue and profit quality for ${current.name}.`}
        asOf={q.data?.asOf}
      />
      <KpiGrid
        metrics={KPI_ORDER}
        data={q.data?.metrics}
        deltas={q.data?.deltas}
        currency={currency}
        loading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        isRetrying={q.isFetching}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue &amp; CM2 trend</CardTitle>
          <CardDescription>Realized revenue and contribution margin over the last 12 weeks.</CardDescription>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            kind="area"
            currency={currency}
            valueFormat="money"
            data={sampleTimeSeries(['realized_revenue', 'cm2'])}
            series={[
              { key: 'realized_revenue', label: 'Realized Revenue' },
              { key: 'cm2', label: 'CM2' },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
