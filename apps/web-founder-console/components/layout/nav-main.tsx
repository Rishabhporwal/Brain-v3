'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useWorkspace } from '@/lib/workspace'
import { can, hasRole, isFeatureEnabled } from '@/lib/features'
import { cn } from '@/lib/utils'
import type { SidebarNavSection } from '@/constants/sidebar-menu'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

/** Sidebar driven entirely by the nav registry, filtered by feature flags + role. */
export function NavMain({ sections }: { sections: SidebarNavSection[] }) {
  const { current } = useWorkspace()
  const pathname = usePathname()

  return (
    <>
      {sections.map((section, sectionIdx) => {
        if (section.title === 'Settings' && !can.viewSettings(current.userRole)) return null
        const items = section.items.filter((item) => {
          if (item.featureKey && !isFeatureEnabled(current.features, item.featureKey)) return false
          if (item.minRole && !hasRole(current.userRole, item.minRole)) return false
          return true
        })
        if (items.length === 0) return null
        return (
          <SidebarGroup key={section.title ?? sectionIdx}>
            {section.title ? <SidebarGroupLabel>{section.title}</SidebarGroupLabel> : null}
            <SidebarGroupContent className="flex flex-col gap-2">
              <SidebarMenu>
                {items.map((item) => {
                  const href = `/w/${current.slug}/${item.path}`
                  const isActive = pathname === href
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        className={cn(isActive && 'bg-accent text-accent-foreground')}
                      >
                        <Link href={href}>
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}
    </>
  )
}
