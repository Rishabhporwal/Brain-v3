#!/usr/bin/env bash
# Runs once on an empty data dir (postgres docker-entrypoint-initdb.d).
# Applies the canonical Brain Phase-1 schema + seed from the mounted data-platform SQL.
set -euo pipefail
echo "[brain] applying Phase-1 schema…"
for f in /brain/schema/*.sql; do
  echo "  • schema $(basename "$f")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -q -f "$f"
done
for f in /brain/seed/*.sql; do
  echo "  • seed $(basename "$f")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -q -f "$f"
done
# Phase-1 leakage guard (§28.2): refuse to come up if a Phase>1 table leaked in.
leak=$(psql -tA --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "SELECT coalesce(string_agg(table_name,','),'') FROM brain_meta.schema_tables WHERE phase>1;")
if [ -n "$leak" ]; then echo "[brain] ✗ LEAK (phase>1): $leak"; exit 1; fi
count=$(psql -tA --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "SELECT count(*) FROM brain_meta.schema_tables;")
echo "[brain] ✓ Phase-1 schema applied — $count tables registered, leakage guard clean."
