import { NestFactory } from '@nestjs/core'
import { AppModule } from './config/app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.METRIC_ENGINE_PORT ?? 7080)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`metric-engine listening on :${port}`)
}
void bootstrap()
