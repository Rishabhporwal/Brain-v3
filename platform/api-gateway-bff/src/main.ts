import 'reflect-metadata'
import { config as loadEnv } from 'dotenv'
loadEnv() // load .env (local dev: real OAuth creds); container env still wins where set explicitly
import { NestFactory } from '@nestjs/core'
import { AppModule } from './config/app.module'
import { LoggingInterceptor } from './api/logging.interceptor'

async function bootstrap() {
  // rawBody: keep the exact request bytes so inbound webhooks (Shopify HMAC) can be verified.
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'], rawBody: true })
  app.enableCors({ origin: true, credentials: true })
  // The fail-closed access-control filter is registered by AccessControlModule (APP_FILTER).
  // One structured JSON log line per request, correlated by traceId + brand_id (PII-safe).
  app.useGlobalInterceptors(new LoggingInterceptor())
  const port = Number(process.env.PORT ?? 4000)
  await app.listen(port, '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`[api-gateway-bff] listening on http://localhost:${port}`)
}
void bootstrap()
