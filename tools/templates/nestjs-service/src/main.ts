// COMPOSITION ROOT — the only file that knows how to start the process.
// Validate config, init telemetry, create the Nest app, wire health/shutdown, listen.
import { NestFactory } from '@nestjs/core'
import { AppModule } from './config/app.module'
import { loadEnv } from './config/env'

async function bootstrap() {
  const env = loadEnv() // fail fast on bad config
  // initTelemetry(env)  // OTel tracing/metrics — trace IDs must flow end-to-end (QA veto)
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.enableShutdownHooks()
  await app.listen(env.PORT)
}
bootstrap()
