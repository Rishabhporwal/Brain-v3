'use server'

import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'

/**
 * RP-initiated (federated) logout: clears the local Auth.js session AND ends the Keycloak SSO session
 * via the OIDC end-session endpoint, then returns to /auth/login. Falls back to a local-only sign-out
 * when Keycloak isn't configured.
 */
export async function federatedSignOut() {
  const session = await auth()
  const idToken = session?.idToken

  await signOut({ redirect: false }) // clear the local session cookie

  const issuer = process.env.KEYCLOAK_ISSUER
  const appUrl = process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (issuer && idToken) {
    const url = new URL(`${issuer}/protocol/openid-connect/logout`)
    url.searchParams.set('id_token_hint', idToken)
    url.searchParams.set('post_logout_redirect_uri', `${appUrl}/auth/login`)
    redirect(url.toString())
  }
  redirect('/auth/login')
}
