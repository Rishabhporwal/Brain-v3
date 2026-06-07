import { Inject, Injectable } from '@nestjs/common'
import { Pool } from 'pg'
import { PG_POOL } from '../persistence/db.providers'

/**
 * Operator-identity resolution: maps a verified Keycloak principal to a platform.users row. Kept separate
 * from customer/CDP identity (identity.customers) per the architecture's operator-vs-customer split.
 *
 * NOTE (Checkpoint B follow-up): email_hash currently stores the Keycloak `sub`. To make account-linking
 * by verified email work (BRD: "link existing users, never duplicate"), this should key on a salted hash
 * of the normalized email. Left as-is here to avoid disturbing existing memberships; tracked for the
 * auth/identity step. The single chokepoint means the change lands in one place.
 */
@Injectable()
export class IdentityService {
  constructor(@Inject(PG_POOL) private readonly pg: Pool) {}

  /** Upsert the user for a Keycloak subject and return its platform.users id. Global table — no RLS. */
  async userIdForSub(sub: string, email?: string): Promise<string> {
    const { rows } = await this.pg.query<{ id: string }>(
      `INSERT INTO platform.users(email_hash, display_name) VALUES ($1, $2)
       ON CONFLICT (email_hash) DO UPDATE SET display_name = COALESCE(platform.users.display_name, $2)
       RETURNING id`,
      [sub, email ?? null],
    )
    return rows[0].id
  }
}
