# Access Control — Tenant Isolation & RBAC

The Platform Foundation's authoritative reference for **how Brain keeps one brand's data
walled off from another's** and **how it decides what each user may do**. Source of truth:
`Brain_Solution_Architecture.docx` §12.4, `Brain_Database_Schema.docx` §1.5, `Brain_Implementation_Blueprint` §2.5–2.7, `Brain_BRD` §7.

> **Tenancy model:** `Organization → Brand (Workspace) → User`. The **Brand `brand_id` is the
> workspace isolation key**. Users are global identities; access is granted only through
> **memberships** `(user_id, organization_id, brand_id, role_id)`. Customer identities never cross brands.

---

## 1. The AccessControl abstraction

One seam every service imports — `@brain/access-control` — composing two focused packages:

| Package | Responsibility |
|---|---|
| `@brain/tenancy` | Brand-context resolution, RLS-bound transactions, control-plane lookups, row-ownership assertion (isolation Layers 1 & 3) |
| `@brain/authz` | Versioned permission registry, fixed role→permission map, `@RequirePermission` guard, `/permissions` builder, last-owner protection |
| `@brain/access-control` | The `AccessControl` facade + a single re-export surface |

```ts
import { AccessControl, RequirePermission, PERMISSIONS, withBrandContext } from '@brain/access-control'

const ac = new AccessControl(pgPool)
const ctx = await ac.contextFor(userId, brandSlug)      // membership enforced (throws → 404)
await ac.runInBrand(ctx, (client) => client.query(...)) // tenant query under RLS
ac.assertCan(ctx, PERMISSIONS.COSTS_WRITE)              // RBAC check (throws → 403)
```

`AccessControl` API: `contextFor` / `tryContextFor`, `runInBrand`, `controlPlane`, `can` / `assertCan`,
`permissionsFor`, `assertNotLastOwner`.

---

## 2. Four-layer tenant isolation (fail closed)

A cross-brand read/write must fail at **every** layer; missing context denies by default.

### Layer 1 — application tenant guard
`withBrandContext(pool, {brandId, organizationId}, fn)` runs `fn` inside a transaction that first executes:
```sql
SET LOCAL ROLE brain_app;                          -- a role RLS APPLIES to (not the owner/superuser)
SELECT set_config('app.current_brand', $brandId, true);   -- = SET LOCAL, reverts on COMMIT/ROLLBACK
SELECT set_config('app.current_org',   $orgId,   true);
```
The connection role is the DB owner (which **bypasses** RLS), so every tenant query drops into the
non-superuser `brain_app` role for the duration of the transaction. **Tenant data uses this; nothing
sets the GUC outside it**, so an out-of-context query sees nothing.

> Production note: prefer connecting as a dedicated non-superuser **login** role outright. `SET LOCAL
> ROLE` is the local/dev-safe equivalent that needs no `PG_URL` change. The login role must be `GRANT`ed
> membership in `brain_app`.

### Layer 2 — PostgreSQL Row-Level Security
Every tenant table has `ENABLE` + `FORCE ROW LEVEL SECURITY` and the policy (`brain_apply_brand_rls()`):
```sql
CREATE POLICY brand_isolation ON <table>
  USING      (brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid)
  WITH CHECK (brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid);
```
- `NULLIF(...,'')` → an unset/empty GUC becomes `NULL` → matches no row (**fail closed**), never a cast error.
- `WITH CHECK` blocks INSERT/UPDATE of a row for a different brand.
- `platform.brands` isolates on `id`; `platform.memberships` / `platform.audit_logs` also allow `brand_id IS NULL` (org-level rows).
- **Global reference tables** (`reference.*`, registries) carry no `brand_id` and no RLS — read-only to tenants.

`brain_app` is granted `SELECT/INSERT/UPDATE/DELETE` on tenant schemas, `SELECT` on `reference`, and is
**denied UPDATE/DELETE on `platform.audit_logs`** (append-only). See `data/stores/postgres/schema/90_grants.sql`.

### Layer 3 — runtime row validation
`assertBrandOwnership(rows, brandId)` throws `CrossTenantViolationError` if any returned row's `brand_id`
isn't the active brand — a backstop that turns a hypothetical RLS gap into a logged 500, never a leak.

### Layer 4 — release-blocking isolation tests
`platform/api-gateway-bff/test/isolation/tenant-isolation.spec.ts` (run with `RUN_DB_TESTS=1`): cross-brand
**read/insert/update/delete** all fail closed, no-context → 0 rows, access-control resolution, and the
Layer-3 assertion. **7/7 must pass** — wire into CI as a merge gate.

### Control plane vs tenant data
Identity/membership lookups that span brands (e.g. "list my workspaces") **cannot** be brand-RLS-bound.
They run via `withControlPlane` (privileged role, **no** brand GUC) and **must** be explicitly scoped by
`user_id`. Everything else is tenant data and uses `withBrandContext`.

---

## 3. Fixed RBAC

**11 code-seeded roles, no custom roles in v1.** Code is canonical (`@brain/authz` `roles.ts`);
`data/stores/postgres/seed/{10,11}_*.sql` mirror it.

- **Org scope:** `Owner`
- **Brand scope:** `Brand Admin`, `Marketing Manager`, `Marketing Analyst`, `Finance Manager`,
  `Finance Analyst`, `Operations Manager`, `Operations Analyst`, `Support Manager`, `Support Analyst`, `Read Only`

Permissions are **feature/action keys** in a **versioned registry** (`REGISTRY_VERSION`), e.g.
`analytics.read`, `ads.write`, `costs.write`, `integrations.write`, `users.manage`, `billing.manage`,
`refund.execute`, `brand.delete`. Mapping summary: Owner = all; Brand Admin = full brand management minus
org-only billing/delete; Manager = domain write; Analyst = domain read; Read Only = reads only.

### Three-level enforcement
1. **API guards** — `BrandContextGuard` resolves + **requires** membership for every `:slug` route
   (non-member → 404), then `PermissionGuard` + `@RequirePermission(PERMISSIONS.X)` enforces the permission
   (missing → 403). UI visibility is **not** security.
2. **Frontend permission endpoint** — `GET /api/workspaces/:slug/permissions` returns the caller's role +
   permission set (+ registry version) for show/hide. Advisory only.
3. **Guardrail / execution layer** — money-moving actions (`refund.execute`, …) check permission
   programmatically via `ac.assertCan`; full guardrail engine lands in Phase 5.

### Last-owner protection
`assertNotLastOwner(orgId, membershipId)` throws `LastOwnerError` (→ 409) if revoking/downgrading would
leave the organization with no active `Owner`. Enforced on membership revoke.

---

## 4. Identity & authentication

- **Keycloak is the identity broker** (`brain` realm): email/password, **Google** social login (Facebook/Apple
  intentionally out of scope), JWT + refresh, MFA. The app verifies Keycloak JWTs (`KeycloakGuard`); it never
  stores passwords.
- **Operator identity ≠ customer identity.** Operators live in `platform.users` (keyed on a **salted hash of
  the verified email** — `IdentityService.emailHash`), customers in `identity.customers`. Email-keying is what
  makes **account linking** ("same email = one user across IdPs/invites") and **link-existing-not-duplicate** work.
- **Email flows** (`verifyEmail`, `resetPasswordAllowed`) send through the realm **SMTP** server (Gmail via
  `deployment/local/.env`, resolved by Keycloak `${ENV}` substitution).
- **MFA for privileged roles** — realm OTP policy is configured (TOTP), making the platform MFA-ready. The
  enforcement design: a conditional OTP subflow keyed on a Keycloak `privileged` realm role, assigned to users
  holding org `Owner`. Keycloak↔app role sync is the remaining wiring (tracked).

### Invite-only user lifecycle
`InviteService`: **invite** → `pending` membership + opaque single-use **expiring** token (random secret;
only its SHA-256 stored in `platform.verification_tokens`, 7-day TTL) → email. **accept** (the signed-in
invitee, email must match) → `active`. **resend** rotates the token; **revoke** → `revoked` + burns the token.
States: `pending | accepted(active) | expired | revoked`. Existing users are linked by email, never duplicated.

---

## 5. Cross-store `brand_id` propagation

| Surface | How `brand_id` flows | Status |
|---|---|---|
| Postgres | RLS `app.current_brand` (Layers 1–2) | ✅ |
| Kafka | event **partition key = `brandId`** + `brand_id` in the envelope (`infrastructure/messaging/events.ts`) | ✅ |
| ClickHouse | `brain_current_brand` query setting + per-table row policies | ✅ |
| Logs/traces | `BrandContext` carries `brandId`; cross-tenant blocks are logged | ⚠️ structured request-logging middleware is the remaining wiring (observability stack is Phase-1 stubbed) |

**Never log PII** — emails are redacted in logs (`a***@domain`); operator emails are stored only as salted
hashes; customer data is analyzed at city/pincode level per the architecture.

---

## 6. Where things live

```
shared/ts/tenancy           # Layers 1 & 3 + context resolution
shared/ts/authz             # roles, permissions, guard, last-owner
shared/ts/access-control    # the AccessControl facade
data/stores/postgres/schema/03_functions.sql   # brain_apply_brand_rls (NULLIF-hardened)
data/stores/postgres/schema/10_platform.sql    # platform tables + explicit policies
data/stores/postgres/schema/90_grants.sql      # brain_app grants (makes RLS enforce)
data/stores/postgres/seed/{10,11}_*.sql        # 11 roles + role→permission map
platform/api-gateway-bff/src/api/guards/       # KeycloakGuard, BrandContextGuard
platform/api-gateway-bff/src/application/{identity,invite,mail}.service.ts
platform/api-gateway-bff/test/isolation/       # Layer-4 release gate + invite lifecycle
```

## 7. Known follow-ups
- Org `Owner` is currently created as a brand-scoped membership; for multi-brand orgs, create it **org-level**
  (`brand_id NULL`) so one Owner row reaches every brand (`resolveBrandContext` already supports both).
- Structured request logging with `brand_id`/trace IDs (Layer-5 of propagation).
- MFA privileged-role → Keycloak group sync.
- Adopt `@brain/access-control` in the standalone `platform/*` service stubs as they are built out.
