import { Module } from '@nestjs/common'
import { HealthController } from '../api/health.controller'
import { MetricsController } from '../api/metrics.controller'
import { MetricsService } from '../application/metrics.service'
import { ClickhouseReader, chProvider } from '../persistence/clickhouse.reader'

@Module({
  controllers: [HealthController, MetricsController],
  providers: [chProvider, ClickhouseReader, MetricsService],
})
export class AppModule {}
