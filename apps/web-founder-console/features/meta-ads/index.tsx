'use client'

import { MetricsSurface } from '@/components/metric/metrics-surface'

export function MetaAds() {
  return (
    <MetricsSurface
      surface="meta-ads"
      title="Meta Ads"
      description="Meta spend, efficiency and creative performance."
      metrics={['spend', 'roas', 'mer', 'cac']}
      detailTitle="Campaigns"
      detailDescription="Meta campaigns and creatives."
    />
  )
}
