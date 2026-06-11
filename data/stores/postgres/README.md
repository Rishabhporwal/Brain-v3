# Brain Database — Phase 1 (Aurora PostgreSQL operational schema)

The runnable physical schema for Brain **Phase 1**, derived directly from `docs/Brain_Database_Schema.docx`
(companion to the Solution Architecture & Implementation Blueprint). Built **platform-first**: only Phase-1
tables exist; Phases 2–6 layer on as additive migrations with **no restructuring**.

## What's here

```
schema/                         # applied in lexical order
  00_extensions.sql             # pgcrypto, pg_trgm
  01_meta.sql                   # brain_meta.schema_tables registry + register()  (§1.9 table triple)
  02_enums.sql                  # all shared enum/domain types (§1.3)
  03_functions.sql              # uuidv7(), set_updated_at, brain_apply_brand_rls() (§1.1/§1.5)
  04_reference.sql              # global reference: currencies, regions, tax_slabs (§1.6)
  10_platform.sql               # §2  Platform  (org/brand/user/membership/role/audit/session) — 11
  20_identity.sql               # §3+§22 Identity + resolution rules/jobs/matches/merges — 7
  30_tracking_event.sql         # §4+§19 tracking_keys + event substrate (schema-reg/checkpoint/DLQ) — 6
  40_commerce.sql               # §5  Commerce keys (products/variants/orders/items/cost_config…) — 8
  50_marketing.sql              # §7  Marketing (channels/ad hierarchy/creatives) — 6
  60_integration_shared.sql     # §17 integrations/oauth/sync/health + notifications + catalog — 4+1
  70_consent_compliance.sql     # §6+§26 consent_state/history/evidence/sources/retention — 5
seed/                           # §30 reference + RBAC + connector catalog seed
docker-compose.postgres.yml     # local postgres on :5433
migrate.sh                      # apply + enforce the Phase-1 leakage guard (§28.2)
Makefile                        # db.up / db.migrate / db.verify / db.reset / db.down
```

**53 Aurora tables across 10 schemas.** ClickHouse Phase-1 analytical tables (events, sessions, raw/normalized
events, processing/retry logs, ad spend) are the companion store in `../../warehouse/clickhouse/`.

## Run it

```bash
make db.up            # start local postgres (localhost:5433, db=brain user=brain)
make db.migrate       # apply schema + seed, then assert no Phase>1 table leaked
make db.verify        # tables per phase + per schema
make db.psql          # psql shell
make db.down          # stop + remove
```

## Conventions honored (from §1)

- **UUID v7** PKs (`uuidv7()`); `created_at`/`updated_at` (trigger-maintained); `deleted_at` where retention needs it.
- **Tenant isolation:** every tenant table carries `brand_id` and a standard RLS policy
  (`brand_id = current_setting('app.current_brand')`), `FORCE`d, fail-closed. **100% RLS coverage verified.**
- **Money = integer minor units** + `currency_code`; the exponent comes from `reference.currencies` (never ×100).
  Rates (tax_rate, percent_bps) stay fractional — only rate×money is rounded.
- **Per-service schemas; logical cross-service FKs.** FKs are enforced _within_ a service's schema; cross-service
  references (e.g. `brand_id`, `customer_id` outside identity) are by id, validated by events/contracts (§1.4).
  FKs to global `reference.*` tables are enforced (reference data is shared, not service-owned).
- **Phase leakage guard (§28.2):** `brain_meta.schema_tables` records each table's phase; `migrate.sh` fails
  if any table exceeds `DEPLOY_PHASE`. This runs in CI beside the isolation tests.

## Phase boundaries (what is deliberately absent in Phase 1)

No metric engine / ledger / attribution (P2), no CDP profiles/segments/audiences (P3), no models/predictions (P4),
no agents/guardrails/workflows (P5), no Neo4j graph / aggregation zone (P6). Logistics (§9) and Payment (§10) are
**Phase 2** and are not created here. Each ships in its phase as `schema/NN_*.sql` additions — the skeleton is stable.
