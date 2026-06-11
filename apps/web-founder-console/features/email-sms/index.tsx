'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function EmailSms() {
  return (
    <MetricsSurface
      surface="email-sms"
      title="Email & SMS"
      description="Lifecycle messaging performance and recovered revenue."
      metrics={['realized_revenue', 'orders', 'repeat_rate', 'conversions']}
      detailTitle="Campaign performance"
      detailDescription="Email and SMS campaigns and outcomes."
    />
  )
}
