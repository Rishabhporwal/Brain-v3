'use client'

import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'

/**
 * Sign-in / sign-up buttons. Both routes go through Keycloak (the single IdP):
 * - "Continue with Google" passes kc_idp_hint=google so Keycloak brokers straight to Google.
 * - "Continue with email" uses Keycloak's own login/registration.
 */
export function AuthButtons({ callbackUrl = '/' }: { callbackUrl?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        className="w-full"
        size="lg"
        onClick={() => signIn('keycloak', { callbackUrl }, { kc_idp_hint: 'google' })}
      >
        <GoogleIcon />
        Continue with Google
      </Button>

      <div className="flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-xs">or</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <Button className="w-full" size="lg" onClick={() => signIn('keycloak', { callbackUrl })}>
        Continue with email
      </Button>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}
