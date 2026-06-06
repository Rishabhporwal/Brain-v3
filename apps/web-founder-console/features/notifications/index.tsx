import { InfoSurface } from '@/components/layout/info-surface'

export function Notifications() {
  return (
    <InfoSurface
      title="Notifications"
      description="Severity-routed alerts for revenue, margin, logistics and risk."
      panelTitle="Alerts"
      panelDescription="Your recent notifications."
      emptyLabel="Connect the backend to see notifications."
    />
  )
}
