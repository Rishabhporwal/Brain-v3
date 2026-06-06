import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Signed OAuth `state` — CSRF defence for the authorization-code flow. Opaque, tamper-evident, and
 * short-lived; binds the consent round-trip to a specific provider + brand. Shared by every provider.
 */
export interface OAuthStatePayload {
  provider: string
  brandId: string
  exp: number // unix seconds
  returnTo?: string // safe relative path to return the browser to after the callback
}

/**
 * Constrain a caller-supplied return path to a safe in-app relative path (defence against open-redirect
 * after the OAuth round-trip). Must start with a single "/" and contain no scheme/host. Defaults to /onboarding.
 */
export function safeReturnTo(value: string | undefined): string {
  if (value && /^\/[A-Za-z0-9/_\-?=&.%]*$/.test(value) && !value.startsWith('//')) return value
  return '/onboarding'
}

export function signOAuthState(secret: string, payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify({ ...payload, nonce: randomBytes(8).toString('hex') })).toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyOAuthState(secret: string, token: string): OAuthStatePayload {
  const [body, sig] = (token ?? '').split('.')
  if (!body || !sig) throw new Error('malformed state')
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad state signature')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('state expired')
  return payload
}
