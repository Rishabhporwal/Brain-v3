import { Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import type { Request, Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { PermissionGuard, PERMISSIONS, RequirePermission, type BrandContext } from '@brain/access-control'
import { KeycloakGuard } from '../guards/keycloak.guard'
import { BrandContextGuard } from '../guards/brand-context.guard'
import { McpService } from '../../application/mcp.service'
import type { AuthUser } from '../../application/bff.service'

const BRAND_GUARDS = [KeycloakGuard, BrandContextGuard, PermissionGuard] as const

/**
 * The MCP endpoint — hosted inside the single sync edge (Arch v2 Part 5: one edge, not two).
 * Streamable HTTP in STATELESS mode: each POST is a complete JSON-RPC exchange authenticated by
 * the same Keycloak JWT → brand membership → permission chain as every console route. GET/DELETE
 * (SSE sessions) are intentionally 405 at v1.
 */
@Controller()
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @UseGuards(...BRAND_GUARDS)
  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @Post('api/workspaces/:slug/mcp')
  async handle(
    @Req() req: Request & { user: AuthUser; brandContext: BrandContext },
    @Res() res: Response,
    @Param('slug') _slug: string,
  ): Promise<void> {
    const server = this.mcp.buildServer(req.user, req.brandContext)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }) // stateless
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  }

  @Get('api/workspaces/:slug/mcp')
  methodNotAllowedGet(@Res() res: Response): void {
    res
      .status(405)
      .json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed (stateless MCP: POST only)' },
        id: null,
      })
  }

  @Delete('api/workspaces/:slug/mcp')
  methodNotAllowedDelete(@Res() res: Response): void {
    res
      .status(405)
      .json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed (stateless MCP: POST only)' },
        id: null,
      })
  }
}
