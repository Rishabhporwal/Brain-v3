import { BadRequestException, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { ReconciliationService } from '../application/reconciliation.service'
import { InternalTokenGuard } from './internal-token.guard'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Internal API — the metric engine and billing consume the ledger; surfaces never call it directly. */
@Controller()
@UseGuards(InternalTokenGuard)
export class LedgerController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post('reconcile')
  reconcile(@Query('brand_id') brandId: string) {
    if (!brandId || !UUID_RE.test(brandId)) throw new BadRequestException('brand_id (uuid) required')
    return this.reconciliation.reconcileBrand(brandId)
  }

  @Get('ledger/summary')
  summary(@Query('brand_id') brandId: string) {
    if (!brandId || !UUID_RE.test(brandId)) throw new BadRequestException('brand_id (uuid) required')
    return this.reconciliation.summary(brandId)
  }
}
