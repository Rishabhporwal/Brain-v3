import { NestFactory } from '@nestjs/core'
import { AppModule } from './config/app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.CONSENT_PORT ?? 7083)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`consent listening on :${port}`)
}
void bootstrap()
