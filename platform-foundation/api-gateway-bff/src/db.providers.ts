import { Provider } from '@nestjs/common'
import { Pool } from 'pg'
import { createClient, type ClickHouseClient } from '@clickhouse/client'

export const PG_POOL = 'PG_POOL'
export const CH_CLIENT = 'CH_CLIENT'

export const dbProviders: Provider[] = [
  {
    provide: PG_POOL,
    useFactory: (): Pool =>
      new Pool({ connectionString: process.env.PG_URL ?? 'postgres://brain:brain@localhost:5440/brain' }),
  },
  {
    provide: CH_CLIENT,
    useFactory: (): ClickHouseClient =>
      createClient({ url: process.env.CH_URL ?? 'http://localhost:8125', username: 'default', password: '' }),
  },
]
