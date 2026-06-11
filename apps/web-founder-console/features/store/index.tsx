'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Store() {
  return (
    <MetricsSurface
      surface="store"
      title="Store"
      description="Unified store facts synced from your storefront."
      metrics={['realized_revenue', 'orders', 'aov', 'prepaid_share']}
      detailTitle="Recent orders"
      detailDescription="Latest orders synced from your store."
    />
  )
}
