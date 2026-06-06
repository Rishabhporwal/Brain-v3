'use server'

import { signIn } from '@/lib/auth'
import { createKeycloakUser, sendKeycloakPasswordReset } from '@/lib/auth/keycloak-admin'

/** Create the account in Keycloak, then sign the user straight in (redirects on success). */
export async function signUp(email: string, password: string): Promise<{ error?: string }> {
  const created = await createKeycloakUser(email, password)
  if (!created.ok) return { error: created.error ?? 'Sign-up failed.' }
  // Direct-grant sign-in + redirect home. signIn throws NEXT_REDIRECT on success.
  await signIn('credentials', { email, password, redirectTo: '/' })
  return {}
}

/** Best-effort password reset email via Keycloak. Always reports success (non-revealing). */
export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  await sendKeycloakPasswordReset(email)
  return { ok: true }
}
