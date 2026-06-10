import { randomUUID } from 'node:crypto'

// "Production" is an EXPLICIT signal (BRAIN_ENV=production), NOT NODE_ENV — the local stack runs the prod
// image with NODE_ENV=production, so keying on NODE_ENV would wrongly trip dev. Prod deploys set BRAIN_ENV.
const isProd = process.env.BRAIN_ENV === 'production'

// One ephemeral, per-process secret used ONLY in non-production when a real secret is unset. This removes
// the previous KNOWN shared `'dev'` HMAC key (audit finding: forgeable webhook/OAuth-state signatures), so
// even in dev there is no predictable signing key, and in production a missing secret FAILS CLOSED.
const DEV_EPHEMERAL = `dev-ephemeral-${randomUUID()}`

/** True only in an explicitly-declared production environment. */
export function isProduction(): boolean {
  return isProd
}

/**
 * Resolve a signing/HMAC secret. In production a missing value throws (fail closed — never sign/verify with a
 * guessable fallback). In non-production it returns an unguessable per-process ephemeral so local flows that
 * don't verify real provider signatures still run.
 */
export function signingSecret(value: string | undefined, name: string): string {
  if (value && value.length > 0) return value
  if (isProd) throw new Error(`Missing required signing secret ${name} in production`)
  return DEV_EPHEMERAL
}

/**
 * Boot-time guard: in production, every secret named in REQUIRED_PROD_SECRETS (comma-separated) must be set or
 * the process refuses to start. The list is config, not a hardcode, so each service declares its own required
 * secrets without this shared helper guessing wrong.
 */
export function assertProductionSecrets(): void {
  if (!isProd) return
  const required = (process.env.REQUIRED_PROD_SECRETS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) throw new Error(`Missing required production secrets: ${missing.join(', ')}`)
}
