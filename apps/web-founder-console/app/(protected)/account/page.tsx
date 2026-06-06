'use client'

import { useSession } from 'next-auth/react'
import { federatedSignOut } from '@/lib/auth/logout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/page-header'

export default function AccountPage() {
  const { data: session } = useSession()
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <PageHeader title="Account" description="Your profile and session." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Signed in via Keycloak.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span>{session?.user?.name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{session?.user?.email ?? '—'}</span>
          </div>
          <Button variant="outline" className="mt-2 w-fit" onClick={() => federatedSignOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
