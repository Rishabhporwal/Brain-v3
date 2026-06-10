// INFRASTRUCTURE ADAPTER — implements EventPublisherPort over Kafka. The application
// layer never imports kafkajs; it depends on the port. Use a transactional outbox in
// production so events publish iff the write commits.
import { Inject, Injectable } from '@nestjs/common'
import type { Producer } from 'kafkajs'
import { EventPublisherPort } from '../../application/ports/event-publisher.port'
import { KAFKA_PRODUCER } from '../../config/tokens'

@Injectable()
export class KafkaEventPublisher implements EventPublisherPort {
  constructor(@Inject(KAFKA_PRODUCER) private readonly producer: Producer) {}
  async publish(events: Array<{ type: string; brandId: string; [k: string]: unknown }>): Promise<void> {
    if (!events.length) return
    await this.producer.send({
      topic: 'brain.catalog.events',
      messages: events.map((e) => ({ key: e.brandId, value: JSON.stringify(e) })),
    })
  }
}
