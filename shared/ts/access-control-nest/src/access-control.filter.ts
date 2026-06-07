import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { CrossTenantViolationError, LastOwnerError, NoBrandAccessError, PermissionDeniedError } from '@brain/access-control'

/**
 * Maps @brain/access-control errors to HTTP status codes — fail closed, and never leak why:
 *   NoBrandAccessError        → 404 (do not disclose a brand the caller can't reach)
 *   PermissionDeniedError     → 403
 *   LastOwnerError            → 409 (conflict: would orphan the org)
 *   CrossTenantViolationError → 500 + ERROR log (Layer-3 backstop tripped = a real isolation defect)
 * HttpExceptions pass through unchanged; anything else is a generic 500.
 */
@Catch()
export class AccessControlExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AccessControl')

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse()

    if (exception instanceof NoBrandAccessError) return this.send(res, HttpStatus.NOT_FOUND, 'Not Found')
    if (exception instanceof PermissionDeniedError) return this.send(res, HttpStatus.FORBIDDEN, 'Forbidden')
    if (exception instanceof LastOwnerError) return this.send(res, HttpStatus.CONFLICT, exception.message)
    if (exception instanceof CrossTenantViolationError) {
      this.logger.error(`CROSS-TENANT LEAK BLOCKED: ${exception.message}`)
      return this.send(res, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error')
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()
      return res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body)
    }

    this.logger.error(`Unhandled: ${(exception as Error)?.message ?? exception}`)
    this.send(res, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error')
  }

  private send(res: { status: (n: number) => { json: (b: unknown) => void } }, statusCode: number, message: string): void {
    res.status(statusCode).json({ statusCode, message })
  }
}
