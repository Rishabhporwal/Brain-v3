import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { AccessControl, BRAND_ROLES, type BrandContext } from '@brain/access-control'
import { PG_POOL } from '../persistence/db.providers'
import { IdentityService } from './identity.service'
import { MailService } from './mail.service'
import type { AuthUser } from './bff.service'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const tokenHash = (raw: string): string => createHash('sha256').update(raw).digest('hex')

export interface MemberRow {
  membershipId: string
  userId: string
  displayName: string | null
  role: string
  state: 'pending' | 'active' | 'revoked'
  isAgency: boolean
}

/**
 * Invite-only user lifecycle. Invitations carry an opaque, single-use, expiring token (random secret;
 * only its hash is stored, in platform.verification_tokens). States live on platform.memberships
 * (pending → active | revoked) + token (expired when past expires_at). Existing users are LINKED by email,
 * never duplicated. Requires users.manage (enforced by the controller's PermissionGuard) for all ops
 * except accept (the invitee authenticates and consumes their own token).
 */
@Injectable()
export class InviteService {
  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    private readonly ac: AccessControl,
    private readonly identity: IdentityService,
    private readonly mail: MailService,
  ) {}

  /** Invite an email to the active brand with a brand role. Idempotent per (user, brand, role). */
  async invite(ctx: BrandContext, email: string, roleName: string, appBaseUrl: string) {
    if (!email || !email.includes('@')) throw new BadRequestException('a valid email is required')
    if (!(BRAND_ROLES as readonly string[]).includes(roleName)) {
      throw new BadRequestException(`not an assignable brand role: ${roleName}`)
    }
    const invitedUserId = await this.identity.userIdForEmail(email)
    const roleId = await this.brandRoleId(roleName)

    const membershipId = await this.ac.runInBrand(ctx, async (c) => {
      const res = await c.query<{ id: string }>(
        `INSERT INTO platform.memberships(user_id, organization_id, brand_id, role_id, state, is_agency)
         VALUES ($1,$2,$3,$4,'pending',$5)
         ON CONFLICT (user_id, organization_id, brand_id, role_id)
           DO UPDATE SET state = CASE WHEN platform.memberships.state='revoked' THEN 'pending'
                                      ELSE platform.memberships.state END,
                         updated_at = now()
         RETURNING id`,
        [invitedUserId, ctx.organizationId, ctx.brandId, roleId, roleName === 'Agency'],
      )
      return res.rows[0].id
    })

    const { raw, expiresAt } = await this.issueToken(invitedUserId)
    const acceptUrl = `${appBaseUrl}/invite/accept?token=${raw}`
    await this.mail.send(
      email,
      `You've been invited to ${ctx.brandSlug} on Brain`,
      `You've been invited as ${roleName}. Accept your invitation (expires in 7 days):\n\n${acceptUrl}\n`,
    )
    return { membershipId, email, role: roleName, state: 'pending' as const, expiresAt, acceptUrl }
  }

  /** Re-issue the invite token for a still-pending membership and resend the email. */
  async resend(ctx: BrandContext, membershipId: string, appBaseUrl: string) {
    const m = await this.ac.runInBrand(ctx, async (c) => {
      const res = await c.query<{ user_id: string; state: string; role: string }>(
        `SELECT m.user_id, m.state, r.name AS role
           FROM platform.memberships m JOIN platform.roles r ON r.id = m.role_id
          WHERE m.id = $1 AND m.brand_id = $2`,
        [membershipId, ctx.brandId],
      )
      return res.rows[0]
    })
    if (!m) throw new NotFoundException('membership not found')
    if (m.state !== 'pending') throw new BadRequestException(`cannot resend: membership is ${m.state}`)
    const email = await this.emailless(m.user_id) // we only store a hash; the address must be re-supplied
    const { raw, expiresAt } = await this.issueToken(m.user_id)
    const acceptUrl = `${appBaseUrl}/invite/accept?token=${raw}`
    if (email) await this.mail.send(email, `Your Brain invitation to ${ctx.brandSlug}`, `Accept (expires in 7 days):\n\n${acceptUrl}\n`)
    return { membershipId, state: 'pending' as const, expiresAt, acceptUrl }
  }

  /** Revoke a membership (and any outstanding invite). Last-owner protected. */
  async revoke(ctx: BrandContext, membershipId: string) {
    await this.ac.assertNotLastOwner(ctx.organizationId, membershipId) // throws LastOwnerError → 409
    const out = await this.ac.runInBrand(ctx, async (c) => {
      const res = await c.query<{ user_id: string }>(
        `UPDATE platform.memberships SET state='revoked', updated_at=now()
          WHERE id=$1 AND brand_id=$2 RETURNING user_id`,
        [membershipId, ctx.brandId],
      )
      return res.rows[0]
    })
    if (!out) throw new NotFoundException('membership not found')
    // Burn any outstanding invite token so a revoked invite can't be accepted.
    await this.pg.query(
      `UPDATE platform.verification_tokens SET consumed_at=now()
        WHERE user_id=$1 AND type='invite' AND consumed_at IS NULL`,
      [out.user_id],
    )
    return { membershipId, state: 'revoked' as const }
  }

  /** Accept an invitation: the authenticated invitee consumes their token and their membership goes active. */
  async accept(user: AuthUser, token: string): Promise<{ redirectTo: string }> {
    if (!token) throw new BadRequestException('token required')
    const acceptingUserId = await this.identity.userIdForSub(user.sub, user.email)
    const t = (
      await this.pg.query<{ id: string; user_id: string; expires_at: string; consumed_at: string | null }>(
        `SELECT id, user_id, expires_at, consumed_at FROM platform.verification_tokens
          WHERE type='invite' AND token_hash=$1`,
        [tokenHash(token)],
      )
    ).rows[0]
    if (!t) throw new NotFoundException('invalid invitation')
    if (t.consumed_at) throw new BadRequestException('invitation already used')
    if (new Date(t.expires_at).getTime() < Date.now()) throw new BadRequestException('invitation expired')
    // The signed-in identity must be the invited email (both resolve to the same email-keyed user row).
    if (t.user_id !== acceptingUserId) throw new ForbiddenException('this invitation was issued to a different email')

    const brandSlug = await this.ac.controlPlane(async (c) => {
      await c.query(`UPDATE platform.verification_tokens SET consumed_at=now() WHERE id=$1`, [t.id])
      const res = await c.query<{ slug: string }>(
        `UPDATE platform.memberships m SET state='active', updated_at=now()
           FROM platform.brands b
          WHERE m.user_id=$1 AND m.state='pending' AND b.id=m.brand_id
          RETURNING b.slug`,
        [acceptingUserId],
      )
      return res.rows[0]?.slug
    })
    return { redirectTo: brandSlug ? `/w/${brandSlug}/dashboard` : '/' }
  }

  /** Members + pending invites for the active brand (Settings → Team). */
  async listMembers(ctx: BrandContext): Promise<MemberRow[]> {
    return this.ac.runInBrand(ctx, async (c) => {
      const res = await c.query<{
        id: string; user_id: string; display_name: string | null; role: string; state: MemberRow['state']; is_agency: boolean
      }>(
        `SELECT m.id, m.user_id, u.display_name, r.name AS role, m.state, m.is_agency
           FROM platform.memberships m
           JOIN platform.roles r ON r.id = m.role_id
           JOIN platform.users u ON u.id = m.user_id
          WHERE (m.brand_id = $1 OR (m.brand_id IS NULL AND m.organization_id = $2))
            AND m.state <> 'revoked'
          ORDER BY m.created_at`,
        [ctx.brandId, ctx.organizationId],
      )
      return res.rows.map((r) => ({
        membershipId: r.id,
        userId: r.user_id,
        displayName: r.display_name,
        role: r.role,
        state: r.state,
        isAgency: r.is_agency,
      }))
    })
  }

  private async brandRoleId(roleName: string): Promise<string> {
    const res = await this.pg.query<{ id: string }>(
      `SELECT id FROM platform.roles WHERE scope='brand' AND name=$1`,
      [roleName],
    )
    if (!res.rows[0]) throw new BadRequestException(`unknown role: ${roleName}`)
    return res.rows[0].id
  }

  private async issueToken(userId: string): Promise<{ raw: string; expiresAt: string }> {
    const raw = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
    // One live invite per user: burn prior unconsumed invite tokens.
    await this.pg.query(
      `UPDATE platform.verification_tokens SET consumed_at=now()
        WHERE user_id=$1 AND type='invite' AND consumed_at IS NULL`,
      [userId],
    )
    await this.pg.query(
      `INSERT INTO platform.verification_tokens(user_id, type, token_hash, expires_at)
       VALUES ($1,'invite',$2,$3)`,
      [userId, tokenHash(raw), expiresAt],
    )
    return { raw, expiresAt }
  }

  /** We store only email_hash; resend re-mails only if the address is recoverable. Returns null here
   *  (plaintext lives in the identity vault, out of scope for Phase 1 local). Resend still rotates the token. */
  private async emailless(_userId: string): Promise<string | null> {
    return null
  }
}
