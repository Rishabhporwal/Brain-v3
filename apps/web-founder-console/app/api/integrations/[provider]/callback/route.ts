import { NextRequest, NextResponse } from 'next/server'

/**
 * OAuth callback landing (single public origin for all providers). Each provider's app is configured to
 * redirect the browser here after consent; we forward the code/state to the BFF (which verifies, exchanges
 * the code, and vaults the token), then redirect the browser to wherever the BFF says (the wizard).
 * The BFF callback is self-authenticating (HMAC + signed state), so no session token is forwarded.
 */
const BFF = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
  const fail = (reason: string) => NextResponse.redirect(`${appBase}/onboarding?connect_error=${reason}`)

  try {
    const res = await fetch(`${BFF}/api/integrations/${encodeURIComponent(provider)}/callback${req.nextUrl.search}`, {
      cache: 'no-store',
    })
    if (!res.ok) return fail('callback_failed')
    const { redirectTo } = (await res.json()) as { redirectTo?: string }
    return redirectTo ? NextResponse.redirect(redirectTo) : fail('no_redirect')
  } catch {
    return fail('callback_unreachable')
  }
}
