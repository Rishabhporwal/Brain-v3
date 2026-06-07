import type { PoolClient } from 'pg'
import { OWNER_ROLE } from './roles'

/** Raised when an operation would leave an organization with no active Owner. Fail closed. */
export class LastOwnerError extends Error {
  constructor() {
    super('cannot remove or downgrade the last Owner of the organization')
    this.name = 'LastOwnerError'
  }
}

/**
 * Last-owner protection. Throws LastOwnerError if revoking/downgrading the given membership would leave
 * its organization with zero OTHER active Owners. Call BEFORE the mutation, on a control-plane client
 * (the count spans the whole org, so it must not be brand-RLS-bound).
 */
export async function assertNotLastOwner(
  client: PoolClient,
  organizationId: string,
  membershipIdBeingChanged: string,
): Promise<void> {
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM platform.memberships m
       JOIN platform.roles r ON r.id = m.role_id
      WHERE m.organization_id = $1
        AND r.name = $2
        AND m.state = 'active'
        AND m.id <> $3`,
    [organizationId, OWNER_ROLE, membershipIdBeingChanged],
  )
  if (Number(rows[0]?.n ?? '0') === 0) throw new LastOwnerError()
}
