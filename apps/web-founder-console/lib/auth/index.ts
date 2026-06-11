/**
 * Keycloak auth seam (Auth.js v5). The rest of the app depends ONLY on this module — never on a provider
 * SDK directly — so the IdP can change without touching surfaces. V2 standard: Keycloak (OIDC).
 *
 * Functional once KEYCLOAK_* env is set and a Keycloak realm exists. Until then the seam is in place and
 * the app builds; protected routes redirect to sign-in.
 *
 * Exposes: auth() (server session), handlers (route), signIn/signOut, and getAccessToken() for the BFF client.
 */
import NextAuth, { type DefaultSession } from 'next-auth'
import Keycloak from 'next-auth/providers/keycloak'
import Credentials from 'next-auth/providers/credentials'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    idToken?: string
    error?: 'RefreshFailed'
    user: { id?: string; roles?: string[] } & DefaultSession['user']
  }
}

const issuer = process.env.KEYCLOAK_ISSUER // e.g. http://localhost:8080/realms/brain

// Single-origin Docker (reverse proxy): when the browser and the web container reach Keycloak at
// different hosts, set KEYCLOAK_INTERNAL_ISSUER (container-reachable) and pin explicit endpoints —
// the browser gets the PUBLIC authorize URL while token/jwks calls go over the container network.
// (Keycloak's KC_HOSTNAME pins the token `iss` to the public issuer so validation still matches.)
const internalIssuer = process.env.KEYCLOAK_INTERNAL_ISSUER

const keycloakEndpoints = internalIssuer
  ? {
      authorization: `${issuer}/protocol/openid-connect/auth`,
      token: `${internalIssuer}/protocol/openid-connect/token`,
      userinfo: `${internalIssuer}/protocol/openid-connect/userinfo`,
      jwks_endpoint: `${internalIssuer}/protocol/openid-connect/certs`,
    }
  : {}

// Token endpoint reachable from the server (container network in proxy mode, else the public issuer).
const tokenBase = internalIssuer ?? issuer

/** Decode a JWT payload without verifying — safe here because we fetched it directly from Keycloak. */
function decodeJwt(jwt: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Keycloak Direct Access Grant — authenticate email+password against the realm (legacy-parity login). */
async function passwordGrant(email: string, password: string) {
  const res = await fetch(`${tokenBase}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: process.env.KEYCLOAK_CLIENT_ID ?? '',
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
      username: email,
      password,
      scope: 'openid email profile',
    }),
  })
  if (!res.ok) return null
  return (await res.json()) as { access_token: string; refresh_token: string; id_token: string; expires_in: number }
}

// Register the Keycloak provider only when configured, so the app runs cleanly pre-backend
// (no Auth.js InvalidEndpoints noise); it activates the moment KEYCLOAK_ISSUER is set.
const providers = issuer
  ? [
      Keycloak({
        clientId: process.env.KEYCLOAK_CLIENT_ID,
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
        issuer,
        ...keycloakEndpoints,
      }),
      // Email/password sign-in on our own pages (legacy parity), backed by Keycloak's Direct Access Grant.
      Credentials({
        id: 'credentials',
        name: 'Email and password',
        credentials: { email: {}, password: {} },
        async authorize(creds) {
          const email = typeof creds?.email === 'string' ? creds.email : ''
          const password = typeof creds?.password === 'string' ? creds.password : ''
          if (!email || !password) return null
          const tok = await passwordGrant(email, password)
          if (!tok) return null
          const claims = decodeJwt(tok.access_token)
          return {
            id: String(claims.sub ?? ''),
            email: (claims.email as string) ?? email,
            name: (claims.name as string) ?? (claims.preferred_username as string) ?? email,
            accessToken: tok.access_token,
            refreshToken: tok.refresh_token,
            idToken: tok.id_token,
            expiresAt: Math.floor(Date.now() / 1000) + Number(tok.expires_in ?? 0),
          } as never
        },
      }),
    ]
  : []

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  providers,
  pages: { signIn: '/auth/login' },
  callbacks: {
    // Persist Keycloak tokens on the JWT and refresh the access token when it expires.
    async jwt({ token, account, user }) {
      // OAuth sign-in (Keycloak redirect): tokens arrive on `account`. (Credentials accounts have no
      // access_token, so guard on it — otherwise we'd wipe the credentials tokens below.)
      if (account?.access_token) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.idToken = account.id_token
        token.expiresAt = account.expires_at
        return token
      }
      // Credentials (direct-grant) sign-in: tokens arrive on `user` from authorize().
      const u = user as
        | { accessToken?: string; refreshToken?: string; idToken?: string; expiresAt?: number }
        | undefined
      if (u?.accessToken) {
        token.accessToken = u.accessToken
        token.refreshToken = u.refreshToken
        token.idToken = u.idToken
        token.expiresAt = u.expiresAt
        return token
      }
      const expiresAt = token.expiresAt as number | undefined
      if (typeof expiresAt === 'number' && Date.now() < expiresAt * 1000) return token

      // Access token expired — refresh it via Keycloak. Use tokenBase (the container-reachable internal
      // issuer in proxy mode), NOT the public `issuer`: this callback runs server-side, where the public
      // host (e.g. localhost:8088) is unreachable from inside the web container.
      const refreshToken = token.refreshToken as string | undefined
      if (!tokenBase || !refreshToken) return token
      try {
        const res = await fetch(`${tokenBase}/protocol/openid-connect/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: process.env.KEYCLOAK_CLIENT_ID ?? '',
            client_secret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
            refresh_token: refreshToken,
          }),
        })
        const data = (await res.json()) as {
          access_token?: string
          refresh_token?: string
          expires_in?: number
        }
        if (!res.ok) throw data
        token.accessToken = data.access_token
        token.refreshToken = data.refresh_token ?? refreshToken
        token.expiresAt = Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 0)
      } catch {
        token.error = 'RefreshFailed'
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined
      session.idToken = token.idToken as string | undefined
      if (token.error) session.error = token.error as 'RefreshFailed'
      if (session.user && token.sub) session.user.id = token.sub
      return session
    },
  },
})

/** Server-side access token for calling the BFF from Server Components / route handlers. */
export async function getAccessToken(): Promise<string | null> {
  const session = await auth()
  return session?.accessToken ?? null
}

/** Whether Keycloak is configured in this environment (lets the app build/run pre-backend). */
export const authConfigured = Boolean(issuer)
