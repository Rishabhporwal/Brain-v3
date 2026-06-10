import { sleep } from './rate-limiter'

export interface RetryOpts {
  retries: number
  baseMs: number
  maxMs?: number
  /** Decide whether an error is retryable (e.g. 429/5xx). Default: always retry until `retries`. */
  retryable?: (e: unknown) => boolean
  onRetry?: (attempt: number, e: unknown) => void
}

/** Exponential backoff + full jitter. Throws the last error once retries are exhausted. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= opts.retries || (opts.retryable && !opts.retryable(e))) throw e
      const ceil = Math.min(opts.maxMs ?? 30_000, opts.baseMs * 2 ** attempt)
      const delay = Math.floor(deterministicJitter(attempt) * ceil)
      opts.onRetry?.(attempt + 1, e)
      await sleep(delay)
      attempt++
    }
  }
}

// Jitter without Math.random (keeps the kit deterministic-friendly): vary by attempt in [0.5, 1].
function deterministicJitter(attempt: number): number {
  return 0.5 + ((attempt * 2654435761) % 1000) / 2000
}

/** Minimal circuit breaker — opens after N consecutive failures for a cooldown, then half-opens. */
export class CircuitBreaker {
  private failures = 0
  private openedAt = 0
  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 60_000,
  ) {}

  canRequest(now: number = Date.now()): boolean {
    if (this.failures < this.threshold) return true
    return now - this.openedAt >= this.cooldownMs // half-open after cooldown
  }
  onSuccess(): void {
    this.failures = 0
    this.openedAt = 0
  }
  onFailure(now: number = Date.now()): void {
    this.failures++
    if (this.failures >= this.threshold && this.openedAt === 0) this.openedAt = now
  }
}
