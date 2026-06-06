'use client'

import type { ReactNode } from 'react'
import { IconAlertTriangle, IconDatabaseOff } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** A titled panel for a surface's primary detail (table/chart) with consistent loading/empty/error states. */
export function DataPanel({
  title,
  description,
  loading,
  isError,
  isEmpty,
  emptyLabel = 'No data yet — connect the backend to populate this view.',
  onRetry,
  isRetrying,
  children,
}: {
  title: string
  description?: string
  loading?: boolean
  isError?: boolean
  isEmpty?: boolean
  emptyLabel?: string
  onRetry?: () => void
  isRetrying?: boolean
  children?: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : isError ? (
          <div className="text-muted-foreground flex flex-col items-center gap-3 py-10 text-center">
            <IconAlertTriangle className="size-6" />
            <p className="text-sm">This view isn&apos;t reachable yet.</p>
            {onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
                {isRetrying ? 'Retrying…' : 'Retry'}
              </Button>
            ) : null}
          </div>
        ) : isEmpty ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
            <IconDatabaseOff className="size-6" />
            <p className="text-sm">{emptyLabel}</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
