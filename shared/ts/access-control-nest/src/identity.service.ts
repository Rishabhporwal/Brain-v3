import { Inject, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { Pool } from 'pg'
import { PG_POOL } from './tokens'

// Salted hash of the normalized email — the STABLE key for a global operator identity. Keying on email
// (not the IdP `sub`) is what makes account-linking and invite-linking work: the same person across
// Google / a future SAML IdP / an emailed invite resolves to ONE platform.users row. Prod: set
// EMAIL_HASH_SALT and keep plaintext only in the identity vault.
const EMAIL_SALT = process.env.EMAIL_HASH_SALT ?? 'brain-local-email-salt-change-in-prod'

/** Deterministic salted hash of a normalized email. */
export function emailHash(email: string): string {
  return createHash('sha256').update(`${EMAIL_SALT}:${email.trim().toLowerCase()}`).digest('hex')
}

/**
 * Operator-identity resolution: maps a person to a platform.users row. Distinct from customer/CDP identity
 * (identity.customers) per the architecture's operator-vs-customer split. platform.users is global (no RLS).
 */
@Injectable()
export class IdentityService {
  constructor(@Inject(PG_POOL) private readonly pg: Pool) {}

  /** Upsert the user for a verified Keycloak principal, keyed on the verified EMAIL (account linking) or sub. */
  async userIdForSub(sub: string, email?: string): Promise<string> {
    const key = email ? emailHash(email) : sub
    const { rows } = await this.pg.query<{ id: string }>(
      `INSERT INTO platform.users(email_hash, display_name) VALUES ($1, $2)
       ON CONFLICT (email_hash) DO UPDATE
         SET display_name = COALESCE(platform.users.display_name, EXCLUDED.display_name)
       RETURNING id`,
      [key, email ?? null],
    )
    return rows[0].id
  }

  /** Resolve (or create) a user by email alone — for invites to addresses that haven't logged in yet. */
  async userIdForEmail(email: string, displayName?: string): Promise<string> {
    const { rows } = await this.pg.query<{ id: string }>(
      `INSERT INTO platform.users(email_hash, display_name) VALUES ($1, $2)
       ON CONFLICT (email_hash) DO UPDATE
         SET display_name = COALESCE(platform.users.display_name, EXCLUDED.display_name)
       RETURNING id`,
      [emailHash(email), displayName ?? email],
    )
    return rows[0].id
  }
}
