import { NestFactory } from '@nestjs/core'
import { AppModule } from './config/app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.LEDGER_PORT ?? 7082)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`realized-revenue-ledger listening on :${port}`)
}
void bootstrap()
