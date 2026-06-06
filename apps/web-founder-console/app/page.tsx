import { redirect } from 'next/navigation'
import { auth, authConfigured } from '@/lib/auth'
import { serverJson } from '@/lib/api/server'

type MeResponse = { memberships: Array<{ workspace: { slug: string } }> }

/**
 * Base URL is a pure redirect router (matches legacy): unauthenticated → /auth/login; authenticated →
 * first workspace dashboard, or onboarding if they have none. No marketing landing.
 */
export default async function Home() {
  if (!authConfigured) redirect('/auth/login')

  const session = await auth()
  if (!session) redirect('/auth/login')

  const me = await serverJson<MeResponse>('/me').catch(() => ({ memberships: [] }) as MeResponse)
  const first = me.memberships[0]?.workspace.slug
  redirect(first ? `/w/${first}/dashboard` : '/onboarding')
}
