import { InfoSurface } from '@/components/layout/info-surface'

export function GoalsSettings() {
  return (
    <InfoSurface
      title="Goals"
      description="Targets and thresholds per metric, powering RAG status."
      panelTitle="Goals"
      panelDescription="Define targets and thresholds."
      emptyLabel="Connect the backend to manage goals."
    />
  )
}
