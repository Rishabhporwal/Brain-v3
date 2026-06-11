import 'server-only'

/**
 * Keycloak Admin REST helpers for self-service auth (sign-up + password reset) — legacy parity on a
 * Keycloak backend. Uses the realm-admin credentials server-side ONLY (never exposed to the browser).
 * In production swap the master-admin creds for a dedicated service-account client with `manage-users`.
 */
const issuer = process.env.KEYCLOAK_ISSUER ?? ''
const internalIssuer = process.env.KEYCLOAK_INTERNAL_ISSUER
const base = (internalIssuer ?? issuer).replace(/\/realms\/[^/]+$/, '') // e.g. http://localhost:8080
const realm = issuer.match(/\/realms\/([^/]+)$/)?.[1] ?? 'brain'
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER ?? 'admin'
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin'

async function adminToken(): Promise<string> {
  const res = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('admin auth failed')
  return ((await res.json()) as { access_token: string }).access_token
}

/** Create an (already-verified, enabled) realm user with a password. Returns {ok} or a friendly error. */
export async function createKeycloakUser(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await adminToken()
    const res = await fetch(`${base}/admin/realms/${realm}/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        username: email,
        // first/last name + no pending required actions → the account is "fully set up" so direct-grant
        // login works immediately (Keycloak otherwise rejects with "Account is not fully set up").
        firstName: email.split('@')[0],
        lastName: 'User', // placeholder (real name captured in onboarding); must be non-empty for KC
        enabled: true,
        emailVerified: true,
        requiredActions: [],
        credentials: [{ type: 'password', value: password, temporary: false }],
      }),
      cache: 'no-store',
    })
    if (res.status === 201) return { ok: true }
    if (res.status === 409) return { ok: false, error: 'An account with this email already exists.' }
    return { ok: false, error: 'Could not create your account. Please try again.' }
  } catch {
    return { ok: false, error: 'Auth service unavailable. Please try again.' }
  }
}

/** Trigger a Keycloak password-reset email (best-effort; needs SMTP configured). Never reveals existence. */
export async function sendKeycloakPasswordReset(email: string): Promise<void> {
  try {
    const token = await adminToken()
    const found = await fetch(`${base}/admin/realms/${realm}/users?email=${encodeURIComponent(email)}&exact=true`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const users = (await found.json()) as Array<{ id: string }>
    if (!users[0]) return
    await fetch(`${base}/admin/realms/${realm}/users/${users[0].id}/execute-actions-email`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['UPDATE_PASSWORD']),
      cache: 'no-store',
    })
  } catch {
    /* best-effort — swallow (non-revealing) */
  }
}
