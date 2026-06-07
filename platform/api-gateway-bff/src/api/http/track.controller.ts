import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common'
import { TrackService } from '../../application/track.service'

/**
 * Public ingest endpoint — intentionally NOT behind the Keycloak guard. Auth is the write-key.
 */
@Controller()
export class TrackController {
  constructor(private readonly svc: TrackService) {}

  @Post('api/track')
  @HttpCode(202)
  track(@Headers('x-brain-key') key: string | undefined, @Body() body: Record<string, unknown>) {
    return this.svc.ingest(key, body ?? {})
  }
}
