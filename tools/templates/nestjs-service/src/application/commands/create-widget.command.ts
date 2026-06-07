import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Widget } from '../../domain/model/widget'
import { WIDGET_REPOSITORY, WidgetRepositoryPort } from '../ports/widget-repository.port'
import { EVENT_PUBLISHER, EventPublisherPort } from '../ports/event-publisher.port'
import { CreateWidgetDto } from '../dto/create-widget.dto'

/** COMMAND HANDLER — orchestrates a write. Loads/creates aggregate, persists, publishes events.
 *  Depends only on PORTS (interfaces) + the domain — never on pg/kafka directly. */
@Injectable()
export class CreateWidgetCommand {
  constructor(
    @Inject(WIDGET_REPOSITORY) private readonly repo: WidgetRepositoryPort,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisherPort,
  ) {}

  async execute(brandId: string, dto: CreateWidgetDto): Promise<{ id: string }> {
    const widget = Widget.create({ id: randomUUID(), brandId, name: dto.name, priceMinor: dto.priceMinor, now: new Date() })
    await this.repo.save(widget)
    await this.events.publish(widget.pullEvents().map((e) => ({ ...e })))
    return { id: widget.id }
  }
}
