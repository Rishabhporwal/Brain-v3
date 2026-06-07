import { Logger, Provider } from '@nestjs/common'
import { Kafka, type Producer } from 'kafkajs'

export const EVENT_BUS = 'EVENT_BUS'
export const INTEGRATION_TOPIC = 'brain.integration.events' // control plane (integration.connected, …)
export const WEBHOOK_TOPIC = 'brain.integration.webhooks' // data plane — push (provider webhook payloads)
export const PULL_TOPIC = 'brain.integration.pull' // data plane — pull (polled records: ad spend, …)

/**
 * Integration-layer events. The Kafka/Redpanda backbone is the DATA layer for connecting brands' apps
 * (Shopify, Meta, Google, …) and streaming their real-time data in via webhooks — NOT onboarding lifecycle
 * (that stays in `audit_logs`). Two topics: a control plane (`integration.connected` — the trigger a
 * consumer uses to register webhooks) and a data plane (raw webhook payloads, fanned out to ClickHouse).
 * Payload is a versioned JSON envelope; Avro-via-schema-registry is the production upgrade (Redpanda :18081).
 */
export interface DomainEvent {
  type: string // integration.connected, integration.disconnected, …
  brandId: string | null
  actor: string
  payload?: unknown
}

/** A raw provider webhook (data plane). */
export interface WebhookEvent {
  provider: string // shopify, …
  topic: string // e.g. orders/create
  brandId: string
  shop?: string
  payload: unknown
}

/** A batch of records pulled from a provider (polling lane). */
export interface PullBatch {
  provider: string
  brandId: string
  stream: string
  records: Array<{ primaryKey?: string; data: unknown }>
}

export interface EventBus {
  emit(event: DomainEvent): void
  emitWebhook(event: WebhookEvent): void
  emitPull(batch: PullBatch): void
}

/** No brokers configured → events are a no-op (local/CI without Kafka still runs unchanged). */
class NoopEventBus implements EventBus {
  emit(): void {}
  emitWebhook(): void {}
  emitPull(): void {}
}

/** Kafka producer. Connect-on-first-use; emit is fire-and-forget so a broker outage never blocks a request. */
class KafkaEventBus implements EventBus {
  private readonly log = new Logger('EventBus')
  private readonly producer: Producer
  private ready?: Promise<void>

  constructor(brokers: string[]) {
    this.producer = new Kafka({ clientId: 'brain-bff', brokers }).producer()
  }

  private ensureConnected(): Promise<void> {
    if (!this.ready) this.ready = this.producer.connect()
    return this.ready
  }

  private send(topic: string, key: string, value: object, label: string): void {
    void this.publish(topic, key, value).catch((e) => {
      this.ready = undefined // force a reconnect attempt next time
      this.log.warn(`event emit failed (${label}): ${(e as Error).message}`)
    })
  }

  private async publish(topic: string, key: string, value: object): Promise<void> {
    await this.ensureConnected()
    await this.producer.send({ topic, messages: [{ key, value: JSON.stringify(value) }] })
  }

  emit(event: DomainEvent): void {
    this.send(
      INTEGRATION_TOPIC,
      event.brandId ?? 'platform',
      {
        schema_version: '1',
        occurred_at: new Date().toISOString(),
        type: event.type,
        brand_id: event.brandId,
        actor: event.actor,
        payload: event.payload ?? null,
      },
      event.type,
    )
  }

  emitWebhook(event: WebhookEvent): void {
    this.send(
      WEBHOOK_TOPIC,
      event.brandId,
      {
        schema_version: '1',
        received_at: new Date().toISOString(),
        provider: event.provider,
        topic: event.topic,
        brand_id: event.brandId,
        shop: event.shop ?? null,
        payload: event.payload,
      },
      `${event.provider}:${event.topic}`,
    )
  }

  emitPull(batch: PullBatch): void {
    const pulledAt = new Date().toISOString()
    for (const rec of batch.records) {
      this.send(
        PULL_TOPIC,
        batch.brandId,
        {
          schema_version: '1',
          pulled_at: pulledAt,
          provider: batch.provider,
          brand_id: batch.brandId,
          stream: batch.stream,
          primary_key: rec.primaryKey ?? null,
          payload: rec.data,
        },
        `${batch.provider}:${batch.stream}`,
      )
    }
  }
}

export const eventBusProvider: Provider = {
  provide: EVENT_BUS,
  useFactory: (): EventBus => {
    const brokers = process.env.KAFKA_BROKERS
    return brokers ? new KafkaEventBus(brokers.split(',').map((b) => b.trim())) : new NoopEventBus()
  },
}
