import { apiJson } from '@/lib/api/client'

/** A member or pending invite of the active workspace (BFF GET /members). */
export type MemberRow = {
  membershipId: string
  userId: string
  displayName: string | null
  role: string
  state: 'pending' | 'active' | 'revoked'
  isAgency: boolean
}

/** The caller's permission set for the active workspace (BFF GET /permissions). */
export type MePermissions = { version: number; role: string; permissions: string[] }

/** Brand roles that can be assigned via an invite (mirrors @brain/authz BRAND_ROLES). */
export const ASSIGNABLE_ROLES = [
  'Brand Admin',
  'Marketing Manager',
  'Marketing Analyst',
  'Finance Manager',
  'Finance Analyst',
  'Operations Manager',
  'Operations Analyst',
  'Support Manager',
  'Support Analyst',
  'Read Only',
] as const

export function listMembers(slug: string): Promise<MemberRow[]> {
  return apiJson<MemberRow[]>(`/api/workspaces/${slug}/members`)
}

export function getPermissions(slug: string): Promise<MePermissions> {
  return apiJson<MePermissions>(`/api/workspaces/${slug}/permissions`)
}

export function inviteMember(slug: string, email: string, role: string) {
  return apiJson<{ membershipId: string; email: string; role: string; state: 'pending'; expiresAt: string }>(
    `/api/workspaces/${slug}/invites`,
    { method: 'POST', body: JSON.stringify({ email, role }) },
  )
}

export function resendInvite(slug: string, membershipId: string) {
  return apiJson<{ membershipId: string; state: 'pending'; expiresAt: string }>(
    `/api/workspaces/${slug}/invites/${membershipId}/resend`,
    { method: 'POST' },
  )
}

export function revokeMember(slug: string, membershipId: string) {
  return apiJson<{ membershipId: string; state: 'revoked' }>(`/api/workspaces/${slug}/invites/${membershipId}/revoke`, {
    method: 'POST',
  })
}

/** Accept an invitation the signed-in user received (BFF POST /api/invites/accept). */
export function acceptInvite(token: string): Promise<{ redirectTo: string }> {
  return apiJson<{ redirectTo: string }>(`/api/invites/accept`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}
