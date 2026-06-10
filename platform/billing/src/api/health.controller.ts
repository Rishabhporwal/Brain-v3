import { Controller, Get } from '@nestjs/common'

/** Root + K8s probes (operational-readiness baseline). */
@Controller()
export class HealthController {
  @Get()
  root() {
    return { service: 'billing', ok: true }
  }

  @Get('healthz')
  healthz() {
    return { ok: true }
  }

  @Get('readyz')
  readyz() {
    return { ok: true }
  }
}
