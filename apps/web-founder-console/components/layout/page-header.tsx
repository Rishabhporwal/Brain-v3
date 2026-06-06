import type { ReactNode } from 'react'

/** Consistent surface header used by every feature page. */
export function PageHeader({
  title,
  description,
  asOf,
  actions,
}: {
  title: string
  description?: string
  asOf?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {asOf ? <span className="text-muted-foreground text-xs">As of {asOf}</span> : null}
        {actions}
      </div>
    </div>
  )
}
