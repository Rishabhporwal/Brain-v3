'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function StoreAnalytics() {
  return (
    <MetricsSurface
      surface="analytics"
      title="Store Analytics"
      description="Traffic, sessions and conversion from first-party tracking."
      metrics={['sessions','conversion_rate','orders','aov']}
      detailTitle="Traffic and conversion"
      detailDescription="Sessions to orders over the period."
    />
  )
}
