import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common'
import { BillingService } from '../application/billing.service'
import { InternalTokenGuard } from './internal-token.guard'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Internal API — fee preview per brand per month. Money-moving surface: Security co-sign on changes. */
@Controller()
@UseGuards(InternalTokenGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('billing/preview')
  preview(@Query('brand_id') brandId: string, @Query('month') month: string) {
    if (!brandId || !UUID_RE.test(brandId)) throw new BadRequestException('brand_id (uuid) required')
    if (!month) throw new BadRequestException('month (YYYY-MM) required')
    return this.billing.preview(brandId, month)
  }
}
