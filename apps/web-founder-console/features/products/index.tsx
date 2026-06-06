'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Products() {
  return (
    <MetricsSurface
      surface="products"
      title="Products"
      description="Per-SKU margin, repeat and RTO performance."
      metrics={['realized_revenue','orders','aov','rto_rate']}
      detailTitle="Products"
      detailDescription="Per-SKU performance table."
    />
  )
}
