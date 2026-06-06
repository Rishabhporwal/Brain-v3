import { InfoSurface } from '@/components/layout/info-surface'

export function AdCampaignsSettings() {
  return (
    <InfoSurface
      title="Ad Campaigns"
      description="Classify campaigns as acquisition, retention or brand."
      panelTitle="Campaign classification"
      panelDescription="Classify campaigns for honest attribution."
      emptyLabel="Connect the backend to classify campaigns."
    />
  )
}
