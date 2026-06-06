import { InfoSurface } from '@/components/layout/info-surface'

export function SettingsGeneral() {
  return (
    <InfoSurface
      title="Settings"
      description="General workspace settings: profile, region, currency and timezone."
      panelTitle="Workspace"
      panelDescription="Manage your workspace profile and defaults."
      emptyLabel="Connect the backend to manage workspace settings."
    />
  )
}
