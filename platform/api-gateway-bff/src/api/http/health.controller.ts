import { Controller, Get } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'

@SkipThrottle() // health/liveness probes must never be rate-limited
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { ok: true }
  }
}
