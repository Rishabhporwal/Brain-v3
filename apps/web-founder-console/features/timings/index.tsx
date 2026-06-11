'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Timings() {
  return (
    <MetricsSurface
      surface="timings"
      title="Timing"
      description="When customers buy, by hour, day and festival."
      metrics={['orders', 'aov', 'conversion_rate', 'realized_revenue']}
      detailTitle="Order timing"
      detailDescription="Orders by hour and day."
    />
  )
}
