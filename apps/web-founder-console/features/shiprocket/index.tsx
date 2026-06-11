'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Shiprocket() {
  return (
    <MetricsSurface
      surface="shiprocket"
      title="Shiprocket"
      description="Shipping performance via Shiprocket."
      metrics={['delivered_rate', 'rto_rate', 'ndr_rate', 'cod_share']}
      detailTitle="Shipments"
      detailDescription="Shipments and status via Shiprocket."
    />
  )
}
