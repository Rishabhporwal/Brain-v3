'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function CustomerLifecycle() {
  return (
    <MetricsSurface
      surface="customer-lifecycle"
      title="Customer Lifecycle"
      description="Lifecycle stages: new, returning, at-risk and churned."
      metrics={['new_customers', 'returning_customers', 'repeat_rate', 'churn_rate']}
      detailTitle="Lifecycle stages"
      detailDescription="Customers by lifecycle stage."
    />
  )
}
