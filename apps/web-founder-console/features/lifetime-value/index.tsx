'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function LifetimeValue() {
  return (
    <MetricsSurface
      surface="lifetime-value"
      title="Lifetime Value"
      description="Predicted LTV and LTV to CAC by segment."
      metrics={['ltv', 'cac', 'ltv_cac', 'repeat_rate']}
      detailTitle="LTV distribution"
      detailDescription="Lifetime value by segment."
    />
  )
}
