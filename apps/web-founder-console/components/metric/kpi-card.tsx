'use client'

import { IconInfoCircle, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDelta } from '@/lib/format'
import { cn } from '@/lib/utils'

export function KpiCard({
  label,
  value,
  help,
  delta,
  loading,
}: {
  label: string
  value: string
  help?: string
  delta?: number
  loading?: boolean
}) {
  const up = (delta ?? 0) >= 0
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground flex items-center gap-1 text-sm font-medium">
          {label}
          {help ? (
            <Tooltip>
              <TooltipTrigger aria-label={`About ${label}`}>
                <IconInfoCircle className="size-3.5 opacity-60" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{help}</TooltipContent>
            </Tooltip>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold tabular-nums">{value}</span>
            {typeof delta === 'number' ? (
              <span
                className={cn(
                  'flex items-center gap-0.5 text-xs font-medium',
                  up ? 'text-emerald-600' : 'text-red-600',
                )}
              >
                {up ? <IconTrendingUp className="size-3.5" /> : <IconTrendingDown className="size-3.5" />}
                {formatDelta(delta)}
              </span>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
