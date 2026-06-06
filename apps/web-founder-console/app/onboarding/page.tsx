import { auth, authConfigured } from '@/lib/auth'
import { serverJson } from '@/lib/api/server'
import { Onboarding } from '@/features/onboarding'

export default async function OnboardingPage() {
  let defaultFullName = ''
  let email = ''
  let isNewWorkspace = false

  if (authConfigured) {
    const session = await auth()
    defaultFullName = session?.user?.name ?? ''
    email = session?.user?.email ?? ''
    // Already has a workspace? Treat this as "add another" and skip the profile step.
    const me = await serverJson<{ memberships: Array<unknown> }>('/me').catch(() => ({ memberships: [] }))
    isNewWorkspace = (me.memberships?.length ?? 0) > 0
  }

  return <Onboarding defaultFullName={defaultFullName} email={email} isNewWorkspace={isNewWorkspace} />
}
