'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'

/**
 * RP-initiated (federated) logout: clears the local Auth.js session AND ends the Keycloak SSO session
 * via the OIDC end-session endpoint, then returns to /auth/login. Falls back to a local-only sign-out
 * when Keycloak isn't configured.
 *
 * Resilient by design: a session cookie that can't be decoded (e.g. issued by another instance with a
 * different AUTH_SECRET) must never BLOCK logout — that would trap the user. We read the id token
 * best-effort, then force-clear the cookie regardless and redirect.
 */
export async function federatedSignOut() {
  let idToken: string | undefined
  try {
    const session = await auth()
    idToken = session?.idToken
  } catch {
    // Undecryptable / stale cookie — treat as no session; the force-clear below still logs the user out.
  }

  try {
    await signOut({ redirect: false }) // clear the local session cookie
  } catch {
    /* best-effort — fall through to the explicit chunk clear */
  }

  // Belt-and-suspenders: Auth.js chunks large session cookies (authjs.session-token.0/.1, …). A cookie it
  // couldn't decode may not be cleared by signOut, so expire every auth cookie (and chunk) explicitly.
  try {
    const jar = await cookies()
    for (const c of jar.getAll()) {
      if (/^(__Secure-)?authjs\.(session-token|csrf-token|callback-url)/.test(c.name)) jar.delete(c.name)
    }
  } catch {
    /* ignore */
  }

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
