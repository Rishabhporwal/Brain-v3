import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { TeamMembers } from '@/components/team/team-members'

export function Team() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Team" description="Members, roles and invitations for this workspace." />
      <Card>
        <CardContent className="p-4">
          <TeamMembers />
        </CardContent>
      </Card>
    </div>
  )
}
