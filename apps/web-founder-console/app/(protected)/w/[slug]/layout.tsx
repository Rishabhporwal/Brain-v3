import { notFound } from 'next/navigation'
import React from 'react'
import { getWorkspaceContext } from '@/lib/workspace-server'
import { WorkspaceProvider } from '@/lib/workspace'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SiteHeader } from '@/components/layout/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getWorkspaceContext(slug)
  if (!ctx) notFound()

  return (
    <WorkspaceProvider value={ctx}>
      <SidebarProvider
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 72)',
            '--header-height': 'calc(var(--spacing) * 12)',
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2 p-4">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </WorkspaceProvider>
  )
}
