import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpService } from './mcp.service'
import type { BffService, AuthUser } from './bff.service'
import type { FreshnessService } from './freshness.service'
import type { OAuthService } from './oauth.service'
import type { BrandContext } from '@brain/access-control'
import type { Pool } from 'pg'

const user: AuthUser = { sub: 'u-1', email: 'op@brand.dev' } as AuthUser
const ctx = { brandId: '0197604e-32a5-7000-8000-000000000000', brandSlug: 'acme' } as BrandContext

function build() {
  const pg = { query: vi.fn().mockResolvedValue({ rows: [] }) }
  const bff = { summary: vi.fn().mockResolvedValue({ metrics: { realized_revenue: 1_499_000 }, asOf: '2026-06-11', source: 'metric-engine', estimated: [] }) }
  const freshness = { forBrand: vi.fn().mockResolvedValue([{ stream: 'orders', lagMinutes: 5 }]) }
  const oauth = { listForBrand: vi.fn().mockResolvedValue([{ provider: 'shopify', status: 'connected' }, { provider: 'meta', status: 'disconnected' }]) }
  const svc = new McpService(pg as unknown as Pool, bff as unknown as BffService, freshness as unknown as FreshnessService, oauth as unknown as OAuthService)
  return { svc, pg, bff, freshness, oauth }
}

async function connect(svc: McpService) {
  const server = svc.buildServer(user, ctx)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

describe('MCP server (BRD §10.10)', () => {
  it('exposes exactly the v1 read tools', async () => {
    const { svc } = build()
    const client = await connect(svc)
    const tools = (await client.listTools()).tools.map((t) => t.name).sort()
    expect(tools).toEqual(['get_integration_freshness', 'get_metrics', 'list_integrations'])
  })

  it('get_metrics quotes the read-model/metric-engine seam and audit-logs the access', async () => {
    const { svc, bff, pg } = build()
    const client = await connect(svc)
    const res = await client.callTool({ name: 'get_metrics', arguments: {} })
    const payload = JSON.parse((res.content as Array<{ text: string }>)[0].text)
    expect(payload.metrics.realized_revenue).toBe(1_499_000)
    expect(bff.summary).toHaveBeenCalledWith(user, 'acme')
    expect(pg.query).toHaveBeenCalledWith(expect.stringContaining('mcp.tool_called'), [ctx.brandId, 'op@brand.dev', expect.stringContaining('get_metrics')])
  })

  it('list_integrations filters disconnected when asked', async () => {
    const { svc } = build()
    const client = await connect(svc)
    const res = await client.callTool({ name: 'list_integrations', arguments: { include_disconnected: false } })
    const payload = JSON.parse((res.content as Array<{ text: string }>)[0].text)
    expect(payload).toEqual([{ provider: 'shopify', status: 'connected' }])
  })

  it('freshness tool returns per-stream lag', async () => {
    const { svc } = build()
    const client = await connect(svc)
    const res = await client.callTool({ name: 'get_integration_freshness', arguments: {} })
    expect(JSON.parse((res.content as Array<{ text: string }>)[0].text)).toEqual([{ stream: 'orders', lagMinutes: 5 }])
  })
})
