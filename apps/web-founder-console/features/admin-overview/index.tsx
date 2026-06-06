import { InfoSurface } from '@/components/layout/info-surface'

export function AdminOverview() {
  return (
    <InfoSurface
      title="Admin"
      description="Platform administration across organizations and workspaces."
      panelTitle="Overview"
      panelDescription="Users, workspaces and sync at a glance."
      emptyLabel="Connect the backend to load admin data."
    />
  )
}
