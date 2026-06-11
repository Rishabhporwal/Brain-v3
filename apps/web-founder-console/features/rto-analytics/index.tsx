'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function RtoAnalytics() {
  return (
    <MetricsSurface
      surface="rto-analytics"
      title="RTO Analytics"
      description="Return-to-origin cost and risk by pincode, courier and channel."
      metrics={['rto_rate', 'cod_share', 'cm2', 'orders']}
      detailTitle="RTO breakdown"
      detailDescription="RTO by pincode, courier and channel."
    />
  )
}
