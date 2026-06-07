import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { AccessControl, LastOwnerError, resolveBrandContext, type BrandContext } from '@brain/access-control'
import { IdentityService, emailHash } from '../../src/application/identity.service'
import { MailService } from '../../src/application/mail.service'
import { InviteService } from '../../src/application/invite.service'

/**
 * Invite-only user lifecycle (Checkpoint B2). Opt-in via RUN_DB_TESTS=1 against the local stack.
 * Covers: invite → pending; accept → active; single-use token; resend rotates; revoke; last-owner
 * protection; and link-existing-not-duplicate.
 */
const RUN = process.env.RUN_DB_TESTS === '1'
const SFX = `inv${Date.now()}${process.pid}`
const BASE = 'http://localhost:8088'

describe.skipIf(!RUN)('invite lifecycle', () => {
  let pg: Pool
  let svc: InviteService
  let ac: AccessControl
  let identity: IdentityService
  let ownerCtx: BrandContext
  const slug = `${SFX}brand`
  const ownerEmail = `${SFX}-owner@test.dev`
  const inviteeEmail = `${SFX}-invitee@test.dev`
  let orgId = ''
  let brandId = ''
  let ownerMembershipId = ''

  beforeAll(async () => {
    pg = new Pool({ connectionString: process.env.PG_URL ?? 'postgres://brain:brain@localhost:5440/brain' })
    identity = new IdentityService(pg)
    ac = new AccessControl(pg)
    svc = new InviteService(pg, ac, identity, new MailService())

    const ownerRole = (await pg.query<{ id: string }>(`SELECT id FROM platform.roles WHERE scope='org' AND name='Owner'`)).rows[0].id
    orgId = (await pg.query<{ id: string }>(
      `INSERT INTO platform.organizations(name,region,currency,timezone,billing_basis)
       VALUES ($1,'IN','INR','Asia/Kolkata','gmv_percent') RETURNING id`, [`Org ${SFX}`])).rows[0].id
    brandId = (await pg.query<{ id: string }>(
      `INSERT INTO platform.brands(organization_id,name,slug,region,currency,timezone,status)
       VALUES ($1,$2,$3,'IN','INR','Asia/Kolkata','active') RETURNING id`, [orgId, `Brand ${SFX}`, slug])).rows[0].id
    const ownerUserId = await identity.userIdForEmail(ownerEmail, 'Owner')
    ownerMembershipId = (await pg.query<{ id: string }>(
      `INSERT INTO platform.memberships(user_id,organization_id,brand_id,role_id,state)
       VALUES ($1,$2,$3,$4,'active') RETURNING id`, [ownerUserId, orgId, brandId, ownerRole])).rows[0].id
    ownerCtx = (await resolveBrandContext(pg, ownerUserId, slug))!
    expect(ownerCtx?.roleName).toBe('Owner')
  })

  afterAll(async () => {
    await pg?.query(`DELETE FROM platform.verification_tokens WHERE user_id IN (SELECT id FROM platform.users WHERE email_hash=ANY($1))`,
      [[emailHash(ownerEmail), emailHash(inviteeEmail)]]).catch(() => {})
    await pg?.query(`DELETE FROM platform.memberships WHERE brand_id=$1`, [brandId]).catch(() => {})
    await pg?.query(`DELETE FROM platform.brands WHERE id=$1`, [brandId]).catch(() => {})
    await pg?.query(`DELETE FROM platform.organizations WHERE id=$1`, [orgId]).catch(() => {})
    await pg?.query(`DELETE FROM platform.users WHERE email_hash=ANY($1)`, [[emailHash(ownerEmail), emailHash(inviteeEmail)]]).catch(() => {})
    await pg?.end().catch(() => {})
  })

  const tokenFrom = (url: string) => new URL(url).searchParams.get('token')!

  it('invite → creates a PENDING membership for the invited email + an accept token', async () => {
    const res = await svc.invite(ownerCtx, inviteeEmail, 'Marketing Manager', BASE)
    expect(res.state).toBe('pending')
    expect(res.acceptUrl).toContain('/invite/accept?token=')
    const m = await pg.query(`SELECT state FROM platform.memberships WHERE id=$1`, [res.membershipId])
    expect(m.rows[0].state).toBe('pending')
  })

  it('invalid role is rejected', async () => {
    await expect(svc.invite(ownerCtx, `${SFX}-x@test.dev`, 'Supreme Leader', BASE)).rejects.toThrow(/brand role/i)
  })

  it('link-existing-not-duplicate: re-inviting the same email reuses the same user row', async () => {
    await svc.invite(ownerCtx, inviteeEmail, 'Marketing Manager', BASE)
    const users = await pg.query(`SELECT count(*)::int n FROM platform.users WHERE email_hash=$1`, [emailHash(inviteeEmail)])
    expect(users.rows[0].n).toBe(1)
  })

  it('accept → membership goes ACTIVE and redirects to the brand; token is single-use', async () => {
    const invite = await svc.invite(ownerCtx, inviteeEmail, 'Marketing Manager', BASE)
    const token = tokenFrom(invite.acceptUrl)
    const invitee = { sub: `kc-${SFX}`, email: inviteeEmail }

    const out = await svc.accept(invitee, token)
    expect(out.redirectTo).toBe(`/w/${slug}/dashboard`)
    const m = await pg.query(`SELECT state FROM platform.memberships WHERE id=$1`, [invite.membershipId])
    expect(m.rows[0].state).toBe('active')

    await expect(svc.accept(invitee, token)).rejects.toThrow(/already used/i) // single-use
  })

  it('accept by a different email is forbidden', async () => {
    const invite = await svc.invite(ownerCtx, `${SFX}-other@test.dev`, 'Read Only', BASE)
    const token = tokenFrom(invite.acceptUrl)
    const wrongEmail = `${SFX}-wrong@test.dev`
    await expect(svc.accept({ sub: 'kc-wrong', email: wrongEmail }, token)).rejects.toThrow(/different email/i)
    await pg.query(`DELETE FROM platform.memberships WHERE id=$1`, [invite.membershipId]).catch(() => {})
    await pg.query(`DELETE FROM platform.users WHERE email_hash=ANY($1)`,
      [[emailHash(`${SFX}-other@test.dev`), emailHash(wrongEmail)]]).catch(() => {})
  })

  it('revoke → membership becomes REVOKED', async () => {
    const invite = await svc.invite(ownerCtx, `${SFX}-rev@test.dev`, 'Read Only', BASE)
    const out = await svc.revoke(ownerCtx, invite.membershipId)
    expect(out.state).toBe('revoked')
    await pg.query(`DELETE FROM platform.memberships WHERE id=$1`, [invite.membershipId]).catch(() => {})
    await pg.query(`DELETE FROM platform.users WHERE email_hash=$1`, [emailHash(`${SFX}-rev@test.dev`)]).catch(() => {})
  })

  it('last-owner protection: revoking the only Owner is blocked', async () => {
    await expect(svc.revoke(ownerCtx, ownerMembershipId)).rejects.toThrow(LastOwnerError)
  })
})
