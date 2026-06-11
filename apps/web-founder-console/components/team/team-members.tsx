'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useWorkspace } from '@/lib/workspace'
import {
  ASSIGNABLE_ROLES,
  getPermissions,
  inviteMember,
  listMembers,
  resendInvite,
  revokeMember,
  type MemberRow,
} from '@/lib/team'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function TeamMembers() {
  const { current } = useWorkspace()
  const slug = current.slug
  const [members, setMembers] = useState<MemberRow[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!slug) return
    try {
      const [list, perms] = await Promise.all([listMembers(slug), getPermissions(slug)])
      setMembers(list)
      setCanManage(perms.permissions.includes('users.manage'))
    } catch {
      /* not a member / unauthenticated — leave empty (the surface 404s upstream) */
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onRevoke(m: MemberRow) {
    if (!confirm(`Remove ${m.displayName ?? 'this member'} from the workspace?`)) return
    setBusyId(m.membershipId)
    try {
      await revokeMember(slug, m.membershipId)
      toast.success('Member removed')
      await refresh()
    } catch {
      toast.error("Couldn't remove member") // e.g. 409 last-owner
    } finally {
      setBusyId(null)
    }
  }

  async function onResend(m: MemberRow) {
    setBusyId(m.membershipId)
    try {
      await resendInvite(slug, m.membershipId)
      toast.success('Invitation resent')
    } catch {
      toast.error("Couldn't resend invitation")
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
        <Spinner /> Loading members…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <InviteDialog slug={slug} onInvited={refresh} />
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 4 : 3} className="text-muted-foreground text-center">
                No members yet.
              </TableCell>
            </TableRow>
          )}
          {members.map((m) => (
            <TableRow key={m.membershipId}>
              <TableCell>{m.displayName ?? '—'}</TableCell>
              <TableCell>
                {m.role}
                {m.isAgency && (
                  <Badge variant="outline" className="ml-2">
                    Agency
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={m.state === 'active' ? 'outline' : 'secondary'}>
                  {m.state === 'active' ? 'Active' : 'Invited'}
                </Badge>
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {m.state === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === m.membershipId}
                        onClick={() => onResend(m)}
                      >
                        Resend
                      </Button>
                    )}
                    {m.role !== 'Owner' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === m.membershipId}
                        onClick={() => onRevoke(m)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function InviteDialog({ slug, onInvited }: { slug: string; onInvited: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('Marketing Manager')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!email.includes('@')) {
      toast.error('Enter a valid email')
      return
    }
    setBusy(true)
    try {
      await inviteMember(slug, email.trim(), role)
      toast.success(`Invitation sent to ${email.trim()}`)
      setOpen(false)
      setEmail('')
      await onInvited()
    } catch {
      toast.error("Couldn't send the invitation")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Invite member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>They'll get an email with a link to join this workspace.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={busy} onClick={submit}>
            {busy ? 'Sending…' : 'Send invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
