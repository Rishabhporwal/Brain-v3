'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { acceptInvite } from '@/lib/team'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

/** Consumes an invite token (the signed-in user must be the invited email) and redirects into the brand. */
export function AcceptInvite() {
  const router = useRouter()
  const token = useSearchParams().get('token') ?? ''
  const [status, setStatus] = useState<'working' | 'error'>('working')
  const [message, setMessage] = useState('Accepting your invitation…')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // accept once (token is single-use)
    ran.current = true
    if (!token) {
      setStatus('error')
      setMessage('This invitation link is missing its token.')
      return
    }
    acceptInvite(token)
      .then((r) => router.replace(r.redirectTo || '/'))
      .catch(() => {
        setStatus('error')
        setMessage('This invitation is invalid, expired, already used, or was issued to a different email.')
      })
  }, [token, router])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Workspace invitation</CardTitle>
          <CardDescription>Join the workspace you were invited to.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {status === 'working' ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Spinner /> {message}
            </div>
          ) : (
            <>
              <p className="text-destructive text-sm">{message}</p>
              <Button variant="outline" onClick={() => router.replace('/')}>
                Go to dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
