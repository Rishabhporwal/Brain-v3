import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { createRemoteJWKSet, jwtVerify } from 'jose'

// ISSUER is checked against the token's `iss` claim; JWKS_URL is where keys are fetched. They can differ
// (e.g. tokens carry iss=http://localhost:8080 from the browser, while the BFF fetches keys over the
// container network at http://keycloak:8080). Defaults keep them aligned for host runs.
const ISSUER = process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/brain'
const JWKS_URL = process.env.KEYCLOAK_JWKS_URL ?? `${ISSUER}/protocol/openid-connect/certs`
const JWKS = createRemoteJWKSet(new URL(JWKS_URL))

/** Verifies the Keycloak access token and attaches { sub, email, name } to the request. */
@Injectable()
export class KeycloakGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const auth: string | undefined = req.headers?.authorization
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('missing bearer token')
    try {
      const { payload } = await jwtVerify(auth.slice(7), JWKS, { issuer: ISSUER })
      req.user = {
        sub: payload.sub as string,
        email: payload.email as string | undefined,
        name: (payload.name ?? payload.preferred_username) as string | undefined,
      }
      return true
    } catch {
      throw new UnauthorizedException('invalid token')
    }
  }
}
