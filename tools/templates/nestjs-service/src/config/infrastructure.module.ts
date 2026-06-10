// COMPOSITION — provides the concrete infra clients (pg Pool, kafka Producer) as DI tokens.
// Bootstrapped from validated env. This is the only place real clients are constructed.
import { Global, Module } from '@nestjs/common'
import { Pool } from 'pg'
import { Kafka } from 'kafkajs'
import { loadEnv } from './env'
import { PG_POOL, KAFKA_PRODUCER } from './tokens'

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => new Pool({ connectionString: loadEnv().DATABASE_URL }) },
    {
      provide: KAFKA_PRODUCER,
      useFactory: async () => {
        const producer = new Kafka({ brokers: loadEnv().KAFKA_BROKERS.split(',') }).producer()
        await producer.connect()
        return producer
      },
    },
  ],
  exports: [PG_POOL, KAFKA_PRODUCER],
})
export class InfrastructureModule {}
