import { Provider } from '@nestjs/common'
import { Pool } from 'pg'

export const PG_POOL = 'PG_POOL'

export const dbProviders: Provider[] = [
  {
    provide: PG_POOL,
    useFactory: (): Pool =>
      // PG_URL = the ESO-synced app secret (same one the BFF consumes); DATABASE_URL = generic override.
      new Pool({
        connectionString:
          process.env.PG_URL ?? process.env.DATABASE_URL ?? 'postgres://brain:brain@localhost:5433/brain',
      }),
  },
]
