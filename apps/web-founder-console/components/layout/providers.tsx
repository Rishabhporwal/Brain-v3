'use client'

import { SessionProvider } from 'next-auth/react'
import { QueryProvider } from '@/lib/query/provider'
import { TooltipProvider } from '@/components/ui/tooltip'

/** App-wide client providers: auth session, data layer, tooltips. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryProvider>
    </SessionProvider>
  )
}
