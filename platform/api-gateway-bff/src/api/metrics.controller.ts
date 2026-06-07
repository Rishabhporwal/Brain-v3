import { Controller, Get, Header } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { registry } from '../observability/metrics'

/**
 * Prometheus scrape endpoint. Public + unthrottled (scraped on the internal network at bff:4000/metrics;
 * NOT routed through the public Caddy /bff prefix). No tenant data — process + RED metrics only.
 */
@SkipThrottle()
@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): Promise<string> {
    return registry.metrics()
  }
}
