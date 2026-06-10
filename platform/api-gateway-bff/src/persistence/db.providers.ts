import { Provider } from '@nestjs/common'
import { createClient, type ClickHouseClient } from '@clickhouse/client'

// PG_POOL + AccessControl + IdentityService + guards are now provided globally by
// AccessControlModule.forRoot() (@brain/access-control-nest). PG_POOL is re-exported here so existing
// `import { PG_POOL } from '../persistence/db.providers'` call sites keep resolving unchanged.
export { PG_POOL } from '@brain/access-control-nest'
export const CH_CLIENT = 'CH_CLIENT'

export const dbProviders: Provider[] = [
  {
    provide: CH_CLIENT,
    useFactory: (): ClickHouseClient =>
      createClient({ url: process.env.CH_URL ?? 'http://localhost:8125', username: 'default', password: '' }),
  },
]
