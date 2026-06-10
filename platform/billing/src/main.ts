import { NestFactory } from '@nestjs/core'
import { AppModule } from './config/app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.BILLING_PORT ?? 7081)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`billing listening on :${port}`)
}
void bootstrap()
