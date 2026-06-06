'use client'

import { createContext, useContext } from 'react'
import type { CurrencyCode } from '@/lib/format'
import type { WorkspaceRole } from '@/lib/features'

export type WorkspaceData = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  plan: string
  currency: CurrencyCode
  features?: Record<string, boolean> | null
  userRole: WorkspaceRole | null
}

export type WorkspaceMembership = { role: string; workspace: WorkspaceData }

type WorkspaceContextValue = {
  current: WorkspaceData
  role: string
  all: WorkspaceMembership[]
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: WorkspaceContextValue
}) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider')
  return ctx
}

/** Convenience: the active workspace's currency for the format helpers. */
export function useCurrency(): CurrencyCode {
  return useWorkspace().current.currency
}
