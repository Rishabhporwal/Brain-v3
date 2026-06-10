import { Inject, Injectable } from '@nestjs/common'
import { Pool } from 'pg'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { BrandContext } from '@brain/access-control'
import { PG_POOL } from '../persistence/db.providers'
import { BffService, type AuthUser } from './bff.service'
import { FreshnessService } from './freshness.service'
import { OAuthService } from './oauth.service'

/**
 * Customer-facing MCP access (BRD §5.1/§8.10/§10.10): a brand pulls ITS OWN warehouse data on
 * its own terms — hosted INSIDE the edge (one edge, not two), behind the exact same
 * Keycloak → membership → permission chain as the console, READ-ONLY at v1, and every tool
 * call appended to the audit log. Tools quote the read-model/metric-engine seam — never raw
 * stores directly — so MCP answers are the same trusted figures the console shows.
 */
@Injectable()
export class McpService {
  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    private readonly bff: BffService,
    private readonly freshness: FreshnessService,
    private readonly oauth: OAuthService,
  ) {}

  /** Build a per-request server bound to the authenticated (user, brand). Stateless transport. */
  buildServer(user: AuthUser, ctx: BrandContext): McpServer {
    const server = new McpServer({ name: 'brain', version: '1.0.0' })
    const slug = ctx.brandSlug

    server.registerTool(
      'get_metrics',
      {
        description:
          'Trusted business metrics for this workspace (metric-engine figures: realized_revenue, orders, aov, sessions, conversions, conversion_rate, spend, mer, roas, …). Money values are integer minor units. Estimated values are listed in `estimated` and must be labelled.',
        inputSchema: {},
      },
      async () => {
        const result = await this.bff.summary(user, slug)
        await this.audit(ctx, user, 'get_metrics', {})
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      },
    )

    server.registerTool(
      'get_integration_freshness',
      {
        description:
          'Per-stream evidence freshness (lag in minutes) for this workspace: orders, payments, shipments, ad_spend. lagMinutes=null means the stream has never landed.',
        inputSchema: {},
      },
      async () => {
        const result = await this.freshness.forBrand(slug)
        await this.audit(ctx, user, 'get_integration_freshness', {})
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      },
    )

    server.registerTool(
      'list_integrations',
      {
        description: 'Connected integrations for this workspace with status (provider, connected state).',
        inputSchema: { include_disconnected: z.boolean().optional().describe('Include disconnected integrations (default true)') },
      },
      async (args: { include_disconnected?: boolean }) => {
        const all = await this.oauth.listForBrand(slug)
        const result = args.include_disconnected === false ? (all as Array<{ status?: string }>).filter((i) => i.status !== 'disconnected') : all
        await this.audit(ctx, user, 'list_integrations', args)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      },
    )

    return server
  }

  /** BRD §10.10: every MCP access is audit-logged (who, which tool, which args, which brand). */
  private async audit(ctx: BrandContext, user: AuthUser, tool: string, args: unknown): Promise<void> {
    await this.pg.query(
      `INSERT INTO platform.audit_logs(brand_id, actor_type, actor_id, action, after)
       VALUES ($1,'user',$2,'mcp.tool_called',$3)`,
      [ctx.brandId, user.email ?? user.sub, JSON.stringify({ tool, args })],
    )
  }
}
