import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'

/**
 * Service-to-service auth: callers present `x-internal-token` matching METRIC_ENGINE_TOKEN.
 * Fail-closed in production (unset token = nothing passes); open only in explicit local dev.
 * Keycloak service-account JWTs replace this when the platform identity service lands.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.METRIC_ENGINE_TOKEN
    if (!expected) {
      if (process.env.NODE_ENV === 'production') throw new UnauthorizedException('METRIC_ENGINE_TOKEN not configured')
      return true // local/dev without a token
    }
    const got = (ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>().headers['x-internal-token'] ?? '')
    const a = Buffer.from(got)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException()
    return true
  }
}
