# Brain Warehouse — ClickHouse (Phase 1 analytical/serving)

Companion to the Aurora operational schema (`../stores/postgres`). High-volume event & spend bodies live here;
Aurora holds keys/config; Iceberg is the immutable system of record.

- `models/phase1.sql` — Phase-1 tables: customer_events, sessions, raw_events, normalized_events,
  event_processing_log, event_retry_log, fact_spend (+ brand-isolation row policies). Verified on ClickHouse 24.
- Engines: MergeTree locally; **ReplicatedMergeTree** in production. Partition by month; ORDER BY (brand_id, …, ts).
- RLS: emulated via a row policy on the custom setting `brain_current_brand` (declare in users.xml) plus a
  mandatory brand_id filter at the query gateway.

```bash
docker compose -f docker-compose.clickhouse.yml up -d
docker exec -i brain-clickhouse clickhouse-client --multiquery < models/phase1.sql
docker exec brain-clickhouse clickhouse-client -q "SHOW TABLES FROM brain"
```
