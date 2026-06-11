import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common'
import { MetricsService } from '../application/metrics.service'
import { InternalTokenGuard } from './internal-token.guard'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Internal API — consumed by the BFF read-model (via @brain/metric-client), never by surfaces
 * directly (Solution Architecture §8: surfaces read the read-model; the engine stays off the
 * synchronous page-load path).
 */
@Controller()
@UseGuards(InternalTokenGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  async query(
    @Query('brand_id') brandId: string,
    @Query('ids') ids?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!brandId || !UUID_RE.test(brandId)) throw new BadRequestException('brand_id (uuid) required')
    const requested = ids
      ? ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [...this.metrics.registry.keys()]
    return this.metrics.compute(brandId, requested, { from, to })
  }

  @Get('registry')
  registry() {
    return { version: 1, metrics: this.metrics.definitions() }
  }
}
