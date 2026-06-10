import { Module } from '@nestjs/common'
import { HealthController } from '../api/health.controller'
import { BillingController } from '../api/billing.controller'
import { BillingService } from '../application/billing.service'
import { dbProviders } from '../persistence/db.providers'

@Module({
  controllers: [HealthController, BillingController],
  providers: [...dbProviders, BillingService],
})
export class AppModule {}
