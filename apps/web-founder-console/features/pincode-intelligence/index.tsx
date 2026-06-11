'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function PincodeIntelligence() {
  return (
    <MetricsSurface
      surface="pincode-intelligence"
      title="Pincode Intelligence"
      description="RTO/COD risk and delivery quality by pincode."
      metrics={['rto_rate', 'cod_share', 'delivered_rate', 'ndr_rate']}
      detailTitle="Pincode heatmap"
      detailDescription="Risk and delivery quality by pincode."
    />
  )
}
