import { apiJson } from '@/lib/api/client'
import type { DashboardSummary } from './types'

export const dashboardKeys = {
  summary: (slug: string) => ['dashboard', 'summary', slug] as const,
}

/** Fetch the workspace's dashboard summary from the BFF read-model. */
export function fetchDashboardSummary(slug: string): Promise<DashboardSummary> {
  return apiJson<DashboardSummary>(`/api/workspaces/${slug}/dashboard/summary`)
}
