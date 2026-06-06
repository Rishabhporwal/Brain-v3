import { InfoSurface } from '@/components/layout/info-surface'

export function BackfillSettings() {
  return (
    <InfoSurface
      title="Backfill"
      description="Backfill historical ad spend and creative data."
      panelTitle="Ad backfill"
      panelDescription="Run and monitor historical backfills."
      emptyLabel="Connect the backend to run backfills."
    />
  )
}
