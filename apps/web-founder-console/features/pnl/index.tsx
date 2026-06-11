'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function Pnl() {
  return (
    <MetricsSurface
      surface="pnl"
      title="P&L"
      description="Profit and loss from your true economics, not platform numbers."
      metrics={['realized_revenue', 'cm2', 'cm2_margin', 'mer']}
      detailTitle="Contribution-margin statement"
      detailDescription="Revenue through to operating profit."
    />
  )
}
