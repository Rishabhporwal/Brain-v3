'use client'

import { useRouter } from 'next/navigation'
import { IconSelector, IconCheck, IconPlus } from '@tabler/icons-react'
import { useWorkspace } from '@/lib/workspace'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'

const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

export function WorkspaceSwitcher() {
  const { current, all } = useWorkspace()
  const { isMobile } = useSidebar()
  const router = useRouter()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-xs font-bold">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {current.logoUrl ? (
                  <img src={current.logoUrl} alt={current.name} className="size-8 rounded-lg object-cover" />
                ) : (
                  initialsOf(current.name)
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{current.name}</span>
                <span className="text-muted-foreground truncate text-xs capitalize">
                  {current.plan.toLowerCase()} plan
                </span>
              </div>
              <IconSelector className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">Workspaces</DropdownMenuLabel>
            {all.map((m) => (
              <DropdownMenuItem
                key={m.workspace.id}
                onClick={() => router.push(`/w/${m.workspace.slug}/dashboard`)}
                className="gap-2 p-2"
              >
                <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-[10px] font-bold">
                  {initialsOf(m.workspace.name)}
                </div>
                <span className="flex-1 truncate">{m.workspace.name}</span>
                {m.workspace.id === current.id && <IconCheck className="text-primary size-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/onboarding')} className="gap-2 p-2">
              <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                <IconPlus className="size-4" />
              </div>
              <span className="text-muted-foreground">Create workspace</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
