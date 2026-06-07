# audit

**Platform:** platform-foundation · **Owner:** `security` · **Phase:** P1 · **Language:** nestjs-ts

Immutable append-only audit trail (WORM/hash-chain).

See [docs/Brain_Repository_Architecture.md](../../docs/Brain_Repository_Architecture.md) §20/§21 for the service template.

## Access control (mandatory)

This service MUST adopt the shared access-control seam — do not hand-roll tenancy or RBAC:

```ts
import { AccessControlModule, BrandContextGuard, PermissionGuard, RequirePermission, PERMISSIONS } from '@brain/access-control-nest'
import { KeycloakGuard } from './keycloak.guard' // or the shared auth guard

@Module({ imports: [AccessControlModule.forRoot()] })
export class AppModule {}

// Brand-scoped route:
@UseGuards(KeycloakGuard, BrandContextGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.USERS_MANAGE)
@Post('api/workspaces/:slug/...')
```

`AccessControlModule.forRoot()` provides (globally): the PG pool, `AccessControl`, `IdentityService`,
`BrandContextGuard`, `PermissionGuard`, and the fail-closed exception filter. Tenant queries run via
`AccessControl.runInBrand(ctx, …)` (RLS-enforced). See [docs/ACCESS_CONTROL.md](../../docs/ACCESS_CONTROL.md).
