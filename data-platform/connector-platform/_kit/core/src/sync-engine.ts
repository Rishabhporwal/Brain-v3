import type { ConnectorHooks } from './contract'
import type { TokenBucket } from './rate-limiter'
import { withRetry } from './retry'

/** Per-stream cursor persistence (the BFF backs this with integration.sync_state). */
export interface CursorStore {
  get(key: string): Promise<string | undefined>
  set(key: string, cursor: string | undefined): Promise<void>
}

/** Publishes pulled records onto the data plane (the BFF backs this with the Kafka EventBus). */
export interface PullPublisher {
  publish(provider: string, brandId: string, stream: string, records: unknown[]): Promise<void> | void
}

export interface StreamSyncDeps {
  cursors: CursorStore
  publish: PullPublisher
  accessToken: string
  rateLimiter?: TokenBucket
  retries?: number
}

const cursorKey = (provider: string, brandId: string, stream: string) => `${provider}:${brandId}:${stream}`

/**
 * Run one pull cycle for a connector stream: load cursor → rate-limit → pull (with retry) → publish →
 * advance cursor. Provider-agnostic; the connector's `pull` hook does the API-specific work. This is the
 * heart of the polling lane (`_kit/sync-engine`).
 */
export async function runStreamSync(
  connector: ConnectorHooks,
  brandId: string,
  stream: string,
  deps: StreamSyncDeps,
): Promise<{ stream: string; count: number; nextCursor?: string }> {
  if (!connector.pull) throw new Error(`connector ${connector.manifest.provider} has no pull() hook`)
  const key = cursorKey(connector.manifest.provider, brandId, stream)
  const cursor = await deps.cursors.get(key)

  if (deps.rateLimiter) await deps.rateLimiter.acquire()
  const res = await withRetry(() => connector.pull!(stream, cursor, deps.accessToken), {
    retries: deps.retries ?? 3,
    baseMs: 500,
    maxMs: 15_000,
  })

  if (res.records.length) await deps.publish.publish(connector.manifest.provider, brandId, stream, res.records)
  if (res.nextCursor && res.nextCursor !== cursor) await deps.cursors.set(key, res.nextCursor)
  return { stream, count: res.records.length, nextCursor: res.nextCursor }
}

/** Run every pull-mode stream a connector declares. */
export async function runConnectorSync(
  connector: ConnectorHooks,
  brandId: string,
  deps: StreamSyncDeps,
): Promise<Array<{ stream: string; count: number; nextCursor?: string }>> {
  const streams = connector.manifest.streams.filter((s) => s.mode === 'pull')
  const out: Array<{ stream: string; count: number; nextCursor?: string }> = []
  for (const s of streams) out.push(await runStreamSync(connector, brandId, s.name, deps))
  return out
}
