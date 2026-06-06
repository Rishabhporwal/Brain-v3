import { InfoSurface } from '@/components/layout/info-surface'

export function CostsSettings() {
  return (
    <InfoSurface
      title="Costs"
      description="COGS, fees, shipping, COD and RTO provisions that drive honest CM."
      panelTitle="Cost configuration"
      panelDescription="Set the costs behind contribution margin."
      emptyLabel="Connect the backend to configure costs."
    />
  )
}
