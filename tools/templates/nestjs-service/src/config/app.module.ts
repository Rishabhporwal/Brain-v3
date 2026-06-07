// ROOT MODULE — assembles the service: infrastructure + each bounded context + health.
import { Module } from '@nestjs/common'
import { InfrastructureModule } from './infrastructure.module'
import { WidgetModule } from './widget.module'

@Module({ imports: [InfrastructureModule, WidgetModule] })
export class AppModule {}
