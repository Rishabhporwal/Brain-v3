import { DynamicModule, Global, Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { Pool } from 'pg'
import { AccessControl, PermissionGuard } from '@brain/access-control'
import { PG_POOL } from './tokens'
import { IdentityService } from './identity.service'
import { BrandContextGuard } from './brand-context.guard'
import { AccessControlExceptionFilter } from './access-control.filter'

export interface AccessControlModuleOptions {
  /** Postgres connection string; defaults to process.env.PG_URL. */
  pgUrl?: string
}

/**
 * One-import adoption of the full access-control seam for a NestJS service:
 *   imports: [AccessControlModule.forRoot()]
 * Provides (globally): the PG pool (PG_POOL), AccessControl, IdentityService, BrandContextGuard,
 * PermissionGuard, and the fail-closed AccessControlExceptionFilter (as APP_FILTER). Controllers then
 * just `@UseGuards(KeycloakGuard, BrandContextGuard, PermissionGuard)` + `@RequirePermission(...)`.
 */
@Global()
@Module({})
export class AccessControlModule {
  static forRoot(options: AccessControlModuleOptions = {}): DynamicModule {
    return {
      module: AccessControlModule,
      providers: [
        {
          provide: PG_POOL,
          useFactory: (): Pool =>
            new Pool({
              connectionString: options.pgUrl ?? process.env.PG_URL ?? 'postgres://brain:brain@localhost:5440/brain',
            }),
        },
        { provide: AccessControl, useFactory: (pool: Pool) => new AccessControl(pool), inject: [PG_POOL] },
        IdentityService,
        BrandContextGuard,
        PermissionGuard,
        { provide: APP_FILTER, useClass: AccessControlExceptionFilter },
      ],
      exports: [PG_POOL, AccessControl, IdentityService, BrandContextGuard, PermissionGuard],
    }
  }
}
