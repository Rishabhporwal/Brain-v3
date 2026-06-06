import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { UsersTable } from '@/components/data-table/admin-tables'

export function AdminUsers() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Users" description="All users across the platform." />
      <Card>
        <CardContent className="p-4">
          <UsersTable />
        </CardContent>
      </Card>
    </div>
  )
}
