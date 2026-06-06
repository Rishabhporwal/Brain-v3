import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { WorkspacesTable } from '@/components/data-table/admin-tables'

export function AdminWorkspaces() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Workspaces" description="All brands and organizations." />
      <Card>
        <CardContent className="p-4">
          <WorkspacesTable />
        </CardContent>
      </Card>
    </div>
  )
}
