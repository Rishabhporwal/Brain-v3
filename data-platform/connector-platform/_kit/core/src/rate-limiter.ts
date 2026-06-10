/** Token-bucket rate limiter — per-provider API budgets (e.g. Meta ~5 insights calls/min/ad-account). */
export class TokenBucket {
  private tokens: number
  private last: number
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    now: number = Date.now(),
  ) {
    this.tokens = capacity
    this.last = now
  }

  private refill(now: number): void {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec)
    this.last = now
  }

  /** Non-blocking: remove n tokens if available. */
  tryRemove(n = 1, now: number = Date.now()): boolean {
    this.refill(now)
    if (this.tokens >= n) {
      this.tokens -= n
      return true
    }
    return false
  }

  /** Blocking: wait until n tokens are available, then remove them. */
  async acquire(n = 1): Promise<void> {
    for (;;) {
      if (this.tryRemove(n)) return
      const deficit = n - this.tokens
      await sleep(Math.max(10, (deficit / this.refillPerSec) * 1000))
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
