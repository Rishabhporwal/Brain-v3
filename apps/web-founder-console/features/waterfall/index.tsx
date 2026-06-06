'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Waterfall() {
  return (
    <MetricsSurface
      surface="waterfall"
      title="Waterfall"
      description="The contribution-margin waterfall from revenue to CM2."
      metrics={['realized_revenue','cm2','cm2_margin']}
      detailTitle="CM waterfall"
      detailDescription="Each cost step from revenue to CM2."
    />
  )
}
