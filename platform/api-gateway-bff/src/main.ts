import 'reflect-metadata'
import { config as loadEnv } from 'dotenv'
loadEnv() // load .env (local dev: real OAuth creds); container env still wins where set explicitly
import { NestFactory } from '@nestjs/core'
import { AppModule } from './config/app.module'
import { LoggingInterceptor } from './api/logging.interceptor'
import { assertProductionSecrets, isProduction } from './config/secrets'

/**
 * CORS origins: an explicit allowlist from CORS_ALLOWED_ORIGINS (comma-separated). In non-production with no
 * list set, reflect any origin (dev convenience). In production an empty list DENIES cross-origin (fail safe)
 * — never reflect arbitrary origins with credentials (audit finding). "Production" = BRAIN_ENV (not NODE_ENV).
 */
function corsOrigin(): true | string[] {
  const list = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length) return list
  return isProduction() ? [] : true
}

async function bootstrap() {
  assertProductionSecrets() // fail closed at boot if required prod secrets are unset
  // rawBody: keep the exact request bytes so inbound webhooks (Shopify HMAC) can be verified.
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'], rawBody: true })
  app.enableCors({ origin: corsOrigin(), credentials: true })
  // The fail-closed access-control filter is registered by AccessControlModule (APP_FILTER).
  // One structured JSON log line per request, correlated by traceId + brand_id (PII-safe).
  app.useGlobalInterceptors(new LoggingInterceptor())
  const port = Number(process.env.PORT ?? 4000)
  await app.listen(port, '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`[api-gateway-bff] listening on http://localhost:${port}`)
}
void bootstrap()
