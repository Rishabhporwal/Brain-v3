import 'server-only'
import { serverFetch } from '@/lib/api/server'
import type { CurrencyCode } from '@/lib/format'
import type { WorkspaceRole } from '@/lib/features'
import type { WorkspaceData, WorkspaceMembership } from '@/lib/workspace'

export type WorkspaceContext = {
  current: WorkspaceData
  role: string
  all: WorkspaceMembership[]
} | null

const backendConfigured = Boolean(process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL)

type ContextResponse = {
  workspace: {
    id: string
    name: string
    slug: string
    logoUrl: string | null
    plan: string
    currency?: string
    features: Record<string, boolean> | null
  } | null
  membership: { role: WorkspaceRole } | null
}
type MeResponse = {
  memberships: Array<{
    role: WorkspaceRole
    workspace: { id: string; name: string; slug: string; logoUrl: string | null; plan: string; currency?: string }
  }>
}

/**
 * Resolve the active workspace + the user's memberships from the BFF.
 * Pre-backend (no API base configured), returns a dev fallback so the shell/nav renders and the UI is
 * navigable — feature DATA still comes from the BFF and shows empty/error states until it exists.
 */
export async function getWorkspaceContext(slug: string): Promise<WorkspaceContext> {
  if (!backendConfigured) return devFallback(slug)
  try {
    const [contextRes, meRes] = await Promise.all([
      serverFetch(`/api/workspaces/${slug}/context`),
      serverFetch('/me'),
    ])
    if (!contextRes.ok) return null
    const { workspace, membership } = (await contextRes.json()) as ContextResponse
    if (!workspace || !membership) return null
    const me = meRes.ok ? ((await meRes.json()) as MeResponse) : { memberships: [] }

    return {
      current: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        logoUrl: workspace.logoUrl,
        plan: workspace.plan,
        currency: (workspace.currency as CurrencyCode) ?? 'INR',
        features: workspace.features ?? null,
        userRole: membership.role ?? null,
      },
      role: membership.role,
      all: me.memberships.map((m) => ({
        role: m.role,
        workspace: {
          id: m.workspace.id,
          name: m.workspace.name,
          slug: m.workspace.slug,
          logoUrl: m.workspace.logoUrl,
          plan: m.workspace.plan,
          currency: (m.workspace.currency as CurrencyCode) ?? 'INR',
          userRole: m.role ?? null,
        },
      })),
    }
  } catch {
    return null
  }
}

function devFallback(slug: string): WorkspaceContext {
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const ws: WorkspaceData = {
    id: slug,
    name,
    slug,
    logoUrl: null,
    plan: 'free',
    currency: 'INR',
    features: null,
    userRole: 'OWNER',
  }
  return { current: ws, role: 'OWNER', all: [{ role: 'OWNER', workspace: ws }] }
}
