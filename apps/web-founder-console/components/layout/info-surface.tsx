import { PageHeader } from '@/components/layout/page-header'
import { DataPanel } from '@/components/layout/data-panel'

/** Scaffold for config/admin surfaces (forms/tables) — present and gated; populates when the BFF exists. */
export function InfoSurface({
  title,
  description,
  panelTitle,
  panelDescription,
  emptyLabel,
}: {
  title: string
  description?: string
  panelTitle: string
  panelDescription?: string
  emptyLabel?: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={title} description={description} />
      <DataPanel title={panelTitle} description={panelDescription} isEmpty emptyLabel={emptyLabel} />
    </div>
  )
}
