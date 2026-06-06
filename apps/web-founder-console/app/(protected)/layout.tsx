import { redirect } from 'next/navigation'
import { auth, authConfigured } from '@/lib/auth'

/**
 * Protected gate. Once Keycloak is configured (KEYCLOAK_ISSUER set), an unauthenticated request is sent
 * to sign-in. Before the IdP is wired (frontend-only phase), the gate is inert so the UI shell is
 * navigable for development; it activates automatically the moment Keycloak is configured.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (authConfigured) {
    const session = await auth()
    if (!session) redirect('/auth/login')
  }
  return <>{children}</>
}
