// Next.js 16 middleware — guards protected routes via the Keycloak auth seam.
// When Keycloak isn't configured (pre-backend) requests are unauthenticated, so protected routes
// redirect to /auth/login; public routes (/, /auth/*, /api/auth/*, assets) pass through.
import { auth } from '@/lib/auth'

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/integrations') // OAuth callbacks self-auth via HMAC + signed state
  if (!isPublic && !req.auth) {
    const url = new URL('/auth/login', req.nextUrl.origin)
    url.searchParams.set('callbackUrl', pathname)
    return Response.redirect(url)
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
