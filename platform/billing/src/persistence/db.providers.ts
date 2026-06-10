import { Provider } from '@nestjs/common'
import { Pool } from 'pg'

export const PG_POOL = 'PG_POOL'

export const dbProviders: Provider[] = [
  {
    provide: PG_POOL,
    useFactory: (): Pool =>
      new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://brain:brain@localhost:5433/brain' }),
  },
]
