import { createHmac, timingSafeEqual } from 'node:crypto'

export type HmacEncoding = 'base64' | 'hex'

/** Verify a provider webhook HMAC over the RAW body, constant-time. Encoding differs by provider. */
export function verifyHmac(rawBody: Buffer, header: string | undefined, secret: string, encoding: HmacEncoding): boolean {
  if (!header) return false
  const digest = createHmac('sha256', secret).update(rawBody).digest(encoding)
  const a = Buffer.from(digest)
  const b = Buffer.from(header)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Idempotency store — providers redeliver, so dedup on the provider's webhook id. `seen(id)` returns true
 * if the id was already processed (and atomically marks it). Swap the impl (in-memory → Postgres/Redis).
 */
export interface SeenStore {
  seen(id: string): Promise<boolean>
}

/** Process-local seen-set (bounded). Fine for a single instance / tests; use a shared store in prod. */
export class InMemorySeenStore implements SeenStore {
  private readonly ids = new Set<string>()
  private readonly order: string[] = []
  constructor(private readonly max = 50_000) {}
  async seen(id: string): Promise<boolean> {
    if (this.ids.has(id)) return true
    this.ids.add(id)
    this.order.push(id)
    if (this.order.length > this.max) {
      const evict = this.order.shift()
      if (evict) this.ids.delete(evict)
    }
    return false
  }
}
