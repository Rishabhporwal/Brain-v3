'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Cohorts() {
  return (
    <MetricsSurface
      surface="cohorts"
      title="Cohorts"
      description="Retention and revenue by acquisition cohort."
      metrics={['new_customers','repeat_rate','ltv','ltv_cac']}
      detailTitle="Cohort heatmap"
      detailDescription="Retention and revenue by cohort."
    />
  )
}
