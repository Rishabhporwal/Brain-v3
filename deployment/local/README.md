# Brain — Local Platform (`deploy/local`)

One-command local environment. **Phase 1 = the databases**, with the schema auto-applied on first boot
from the **canonical SQL** in `data-platform/` (single source of truth — nothing is copied here).

```bash
make -C deploy/local up        # start postgres + clickhouse, apply schema, verify
make -C deploy/local verify    # table counts + Phase-1 leakage guard
make -C deploy/local psql      # psql shell
make -C deploy/local ch        # clickhouse-client shell
make -C deploy/local down      # stop (keep data)
make -C deploy/local reset     # wipe volumes and rebuild schema from scratch
```

## What comes up

| Service                      | Container                   | Host port                      | Notes                                                                       |
| ---------------------------- | --------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| PostgreSQL 16 (Aurora-equiv) | `brain-local-postgres`      | `5440`                         | 53 Phase-1 tables, RLS, seed. Auto-applied via `postgres/initdb/`.          |
| ClickHouse 24                | `brain-local-clickhouse`    | `8125` (HTTP), `9002` (native) | 7 Phase-1 analytical tables + row policies. Auto-applied from `phase1.sql`. |
| Tabix (ClickHouse web UI)    | `brain-local-clickhouse-ui` | `5521`                         | Browse ClickHouse visually at **http://localhost:5521**.                    |
| pgAdmin (Postgres web UI)    | `brain-local-pgadmin`       | `5050`                         | Browse Postgres visually at **http://localhost:5050**.                      |

## Visually browsing Postgres

Open **http://localhost:5050** (pgAdmin). It opens straight in (desktop mode, no login). The **Brain Local (Postgres)**
server is pre-registered under the _Brain_ group — expand it and enter the password **`brain`** once (tick "Save
Password"). Browse `Databases → brain → Schemas` to see the 10 schemas and 53 tables.

## Visually browsing ClickHouse

Open **http://localhost:5521** (Tabix). Connection is prefilled — name _Brain Local_, host `http://localhost:8125`,
user `default`, no password. CORS is enabled on ClickHouse (`clickhouse/users.d/cors.xml`) so the browser can connect.

The `brain.*` tables have brand-isolation **row policies**, so run `SET brain_current_brand = '<brand-uuid>'`
in the editor before `SELECT`, otherwise you'll see 0 rows (that's the isolation working).

Connection: db / user / password = `brain` / `brain` / `brain`.

Ports are deliberately offset (5440 / 8125 / 9002) so this stack never clashes with other local
Brain containers.

## How the schema gets applied

- **Postgres:** `postgres/initdb/00-apply-brain-schema.sh` runs once on an empty data dir, applies
  `data-platform/stores/postgres/{schema,seed}/*.sql` in order, then asserts the **Phase-1 leakage guard**
  (refuses to come up if any Phase>1 table is present).
- **ClickHouse:** `data-platform/warehouse/clickhouse/models/phase1.sql` is mounted into
  `/docker-entrypoint-initdb.d/`. `clickhouse/config.d/brain.xml` declares the `brain_*` custom-setting
  prefix so the brand-isolation row policies work (`SET brain_current_brand='<uuid>'` per session).

Because the schema is mounted (not baked), editing the canonical SQL and running `make reset` re-applies it.

## Layers

`make up` brings up `docker-compose.yml` + `compose/infra.yml` (the databases). `compose/services.yml`,
`ai.yml`, and `mocks.yml` are valid stubs, layered in as the NestJS/Python services and provider mocks get images.
