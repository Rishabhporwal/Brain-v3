import { randomUUID } from 'node:crypto'

/** Structured key/value fields attached to a log line. NEVER put raw PII here — use redactEmail. */
export type LogFields = Record<string, unknown>

export interface Logger {
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
}

function emit(level: 'info' | 'warn' | 'error', service: string, msg: string, fields?: LogFields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, service, msg, ...fields })
  // Structured JSON to stdout/stderr — a log shipper forwards to the log store.
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line)
  // eslint-disable-next-line no-console
  else console.log(line)
}

/** A structured JSON logger tagged with the service name. */
export function createLogger(service: string): Logger {
  return {
    info: (msg, fields) => emit('info', service, msg, fields),
    warn: (msg, fields) => emit('warn', service, msg, fields),
    error: (msg, fields) => emit('error', service, msg, fields),
  }
}

/** A new correlation id for a request/trace. */
export function newTraceId(): string {
  return randomUUID()
}

/** Redact an email for logs (never log PII): "alice@example.com" → "a***@example.com". */
export function redactEmail(email?: string | null): string | undefined {
  if (!email) return undefined
  const [local, domain] = email.split('@')
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***'
}
