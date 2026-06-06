'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Logistics() {
  return (
    <MetricsSurface
      surface="logistics"
      title="Logistics"
      description="Courier, NDR and delivery performance."
      metrics={['delivered_rate','rto_rate','ndr_rate','cod_share']}
      detailTitle="Courier performance"
      detailDescription="Performance by courier."
    />
  )
}
