import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { HealthController } from '../api/health.controller'
import { LedgerController } from '../api/ledger.controller'
import { ReconciliationService, chProvider } from '../application/reconciliation.service'

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [HealthController, LedgerController],
  providers: [chProvider, ReconciliationService],
})
export class AppModule {}
