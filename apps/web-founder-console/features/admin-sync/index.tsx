import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { SyncTable } from '@/components/data-table/admin-tables'

export function AdminSync() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Sync" description="Connector sync status across the platform." />
      <Card>
        <CardContent className="p-4">
          <SyncTable />
        </CardContent>
      </Card>
    </div>
  )
}
