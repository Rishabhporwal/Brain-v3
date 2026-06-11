'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Distributions() {
  return (
    <MetricsSurface
      surface="distributions"
      title="Distributions"
      description="Distribution of orders, AOV and margin across dimensions."
      metrics={['orders', 'aov', 'cm2_margin', 'rto_rate']}
      detailTitle="Distributions"
      detailDescription="Order, AOV and margin distributions."
    />
  )
}
