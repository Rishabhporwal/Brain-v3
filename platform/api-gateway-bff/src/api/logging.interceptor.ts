import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, tap } from 'rxjs'
import { createLogger, newTraceId } from '@brain/observability'

const log = createLogger('api-gateway-bff')

/**
 * One structured JSON line per request, correlated by traceId and tagged with brand_id (Layer-5 of
 * cross-store propagation). brand_id comes from req.brandContext (set by BrandContextGuard); userId is the
 * opaque Keycloak sub (not PII — email is never logged). The traceId is echoed as the x-request-id header
 * so it can be followed across services.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{
      method: string
      url: string
      headers: Record<string, string | undefined>
      user?: { sub?: string }
      brandContext?: { brandId?: string }
      traceId?: string
    }>()
    const res = ctx.switchToHttp().getResponse<{ statusCode: number; setHeader?: (k: string, v: string) => void }>()
    const traceId = req.headers['x-request-id'] || newTraceId()
    req.traceId = traceId
    res.setHeader?.('x-request-id', traceId)
    const startedAt = Date.now()

    const fields = () => ({
      traceId,
      method: req.method,
      path: req.url,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      brandId: req.brandContext?.brandId,
      userId: req.user?.sub,
    })

    return next.handle().pipe(
      tap({
        next: () => log.info('request', fields()),
        error: (err: { status?: number; message?: string }) =>
          log.error('request_error', { ...fields(), status: err?.status ?? 500, err: err?.message }),
      }),
    )
  }
}
