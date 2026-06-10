import { Suspense } from 'react'
import { AcceptInvite } from '@/features/invite-accept'

// Auth-gated by the (protected) layout — the invitee must be signed in (as the invited email) to accept.
export default function Page() {
  return (
    <Suspense>
      <AcceptInvite />
    </Suspense>
  )
}
