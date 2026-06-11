import { Module } from '@nestjs/common'
import { HealthController } from '../api/health.controller'
import { ConsentController } from '../api/consent.controller'
import { ConsentService } from '../application/consent.service'
import { dbProviders } from '../persistence/db.providers'

@Module({
  controllers: [HealthController, ConsentController],
  providers: [...dbProviders, ConsentService],
})
export class AppModule {}
