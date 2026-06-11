'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Acquisition() {
  return (
    <MetricsSurface
      surface="acquisition"
      title="Acquisition"
      description="Acquisition efficiency by channel, in CM2 terms."
      metrics={['new_customers', 'cac', 'mer', 'spend']}
      detailTitle="Acquisition by channel"
      detailDescription="New customers and CAC by channel."
    />
  )
}
