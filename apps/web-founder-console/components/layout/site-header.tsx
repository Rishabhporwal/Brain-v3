'use client'

import { IconBell } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useWorkspace } from '@/lib/workspace'

/** Top bar of the workspace shell. Notifications/insight indicators land with their feature slices. */
export function SiteHeader() {
  const { current } = useWorkspace()
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <span className="truncate text-sm font-medium">{current.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <IconBell className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
