'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Calendar() {
  return (
    <MetricsSurface
      surface="calendar"
      title="Calendar"
      description="Festival and sale calendar with expected lift."
      metrics={['realized_revenue','orders','mer','cm2']}
      detailTitle="Calendar"
      detailDescription="Festivals and campaigns with expected lift."
    />
  )
}
