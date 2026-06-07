// COMPOSITION — the bounded-context wiring. Binds application PORTS → concrete ADAPTERS.
// This is where Dependency Inversion is satisfied: handlers ask for WIDGET_REPOSITORY,
// they receive WidgetRepository (persistence); EVENT_PUBLISHER → KafkaEventPublisher.
import { Module } from '@nestjs/common'
import { WidgetController } from '../api/http/widget.controller'
import { CreateWidgetCommand } from '../application/commands/create-widget.command'
import { GetWidgetQuery } from '../application/queries/get-widget.query'
import { WIDGET_REPOSITORY } from '../application/ports/widget-repository.port'
import { EVENT_PUBLISHER } from '../application/ports/event-publisher.port'
import { WidgetRepository } from '../persistence/repositories/widget.repository'
import { KafkaEventPublisher } from '../infrastructure/messaging/kafka-event-publisher'

@Module({
  controllers: [WidgetController],
  providers: [
    CreateWidgetCommand,
    GetWidgetQuery,
    { provide: WIDGET_REPOSITORY, useClass: WidgetRepository },
    { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },
  ],
})
export class WidgetModule {}
