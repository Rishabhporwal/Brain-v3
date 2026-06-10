import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { TrackService } from '../../application/track.service'

/**
 * Public ingest endpoint — intentionally NOT behind the Keycloak guard. Auth is the write-key.
 * SkipThrottle: this is high-volume first-party event ingest; the global per-IP limit would throttle a busy
 * storefront's pixel. Write-key auth + (future) per-key quotas are the right control here, not a global cap.
 */
@SkipThrottle()
@Controller()
export class TrackController {
  constructor(private readonly svc: TrackService) {}

  @Post('api/track')
  @HttpCode(202)
  track(@Headers('x-brain-key') key: string | undefined, @Body() body: Record<string, unknown>) {
    return this.svc.ingest(key, body ?? {})
  }
}
