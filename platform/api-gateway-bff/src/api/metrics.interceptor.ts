import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, tap } from 'rxjs'
import { httpDuration, httpTotal } from '../observability/metrics'

/** Records RED metrics (rate, errors, duration) per request, labelled by method/route-pattern/status. */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ method: string; url: string; route?: { path?: string } }>()
    const res = ctx.switchToHttp().getResponse<{ statusCode: number }>()
    const stop = httpDuration.startTimer()
    const record = (status: number) => {
      const route = req.route?.path ?? req.url.split('?')[0] // matched pattern → bounded cardinality
      const labels = { method: req.method, route, status: String(status) }
      stop(labels)
      httpTotal.inc(labels)
    }
    return next.handle().pipe(
      tap({
        next: () => record(res.statusCode),
        error: (err: { status?: number }) => record(err?.status ?? 500),
      }),
    )
  }
}
