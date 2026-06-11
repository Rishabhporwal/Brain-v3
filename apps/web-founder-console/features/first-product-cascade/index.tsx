'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function FirstProductCascade() {
  return (
    <MetricsSurface
      surface="first-product-cascade"
      title="First Product Cascade"
      description="How the first purchase drives repeat behaviour."
      metrics={['new_customers', 'repeat_rate', 'ltv', 'aov']}
      detailTitle="First-product cascade"
      detailDescription="Repeat behaviour by first product."
    />
  )
}
