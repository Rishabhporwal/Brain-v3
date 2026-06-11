import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { ConsentService, type RecordInput } from '../application/consent.service'
import type { Channel, Purpose } from '../domain/policy'
import { InternalTokenGuard } from './internal-token.guard'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHANNELS = new Set(['whatsapp', 'email', 'sms', 'voice', 'push', 'ads', 'chat', 'ig_dm'])
const PURPOSES = new Set(['marketing', 'utility', 'authentication', 'analytics'])
const STATES = new Set(['granted', 'withdrawn', 'not_collected'])

/** Internal API — the BFF, lifecycle, and notification services call this; never end users directly. */
@Controller()
@UseGuards(InternalTokenGuard)
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Post('consent/record')
  record(@Body() body: RecordInput) {
    if (!body?.brand_id || !UUID_RE.test(body.brand_id)) throw new BadRequestException('brand_id (uuid) required')
    if (!body.customer_id || !UUID_RE.test(body.customer_id))
      throw new BadRequestException('customer_id (uuid) required')
    if (!CHANNELS.has(body.channel)) throw new BadRequestException('invalid channel')
    if (!PURPOSES.has(body.purpose)) throw new BadRequestException('invalid purpose')
    if (!STATES.has(body.to_state)) throw new BadRequestException('invalid to_state')
    if (!body.source_name) throw new BadRequestException('source_name required')
    return this.consent.record(body)
  }

  @Get('consent/check')
  check(
    @Query('brand_id') brandId: string,
    @Query('customer_id') customerId: string,
    @Query('channel') channel: string,
    @Query('purpose') purpose: string,
  ) {
    if (!brandId || !UUID_RE.test(brandId)) throw new BadRequestException('brand_id (uuid) required')
    if (!customerId || !UUID_RE.test(customerId)) throw new BadRequestException('customer_id (uuid) required')
    if (!CHANNELS.has(channel)) throw new BadRequestException('invalid channel')
    if (!PURPOSES.has(purpose)) throw new BadRequestException('invalid purpose')
    return this.consent.check(brandId, customerId, channel as Channel, purpose as Purpose)
  }
}
