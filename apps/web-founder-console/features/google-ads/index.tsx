'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function GoogleAds() {
  return (
    <MetricsSurface
      surface="google-ads"
      title="Google Ads"
      description="Google spend, efficiency and campaign performance."
      metrics={['spend', 'roas', 'mer', 'cac']}
      detailTitle="Campaigns"
      detailDescription="Google campaigns."
    />
  )
}
