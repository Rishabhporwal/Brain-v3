// API (inbound adapter) — translates HTTP ⇄ application use-cases. Thin: validate input,
// resolve tenant, call the command/query, map domain errors to HTTP. No business logic here.
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { CreateWidgetCommand } from '../../application/commands/create-widget.command'
import { GetWidgetQuery } from '../../application/queries/get-widget.query'
import { CreateWidgetDto } from '../../application/dto/create-widget.dto'
import { WorkspaceGuard, BrandId } from '../guards/workspace.guard'

@Controller('api/workspaces/:slug/widgets')
@UseGuards(WorkspaceGuard)
export class WidgetController {
  constructor(
    private readonly create: CreateWidgetCommand,
    private readonly get: GetWidgetQuery,
  ) {}

  @Post()
  createWidget(@BrandId() brandId: string, @Body() dto: CreateWidgetDto) {
    return this.create.execute(brandId, dto)
  }

  @Get(':id')
  getWidget(@BrandId() brandId: string, @Param('id') id: string) {
    return this.get.execute(brandId, id)
  }
}
