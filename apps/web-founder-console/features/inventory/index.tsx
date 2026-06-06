'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Inventory() {
  return (
    <MetricsSurface
      surface="inventory"
      title="Inventory"
      description="Stock cover and stockout risk by SKU."
      metrics={['inventory_cover','stockouts','orders','realized_revenue']}
      detailTitle="Inventory by SKU"
      detailDescription="Days of cover and stockout risk."
    />
  )
}
