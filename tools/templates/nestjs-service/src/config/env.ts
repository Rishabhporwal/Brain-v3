// CONFIG — env schema + validation. Fail fast at boot if misconfigured. (zod illustrative)
import { z } from 'zod'
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  KAFKA_BROKERS: z.string().min(1),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
})
export type Env = z.infer<typeof EnvSchema>
export const loadEnv = (raw: NodeJS.ProcessEnv = process.env): Env => EnvSchema.parse(raw)
