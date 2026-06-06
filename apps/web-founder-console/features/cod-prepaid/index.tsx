'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function CodPrepaid() {
  return (
    <MetricsSurface
      surface="cod-prepaid"
      title="COD vs Prepaid"
      description="COD and prepaid mix and its margin impact."
      metrics={['cod_share','prepaid_share','rto_rate','aov']}
      detailTitle="COD vs prepaid"
      detailDescription="Mix and realized margin by payment method."
    />
  )
}
