// APPLICATION PORT — outbound. Use-cases publish domain events through this;
// the Kafka adapter lives in infrastructure/messaging.
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER')
export interface EventPublisherPort {
  publish(events: Array<{ type: string; brandId: string; [k: string]: unknown }>): Promise<void>
}
