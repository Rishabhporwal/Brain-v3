#!/usr/bin/env bash
# Apply the Brain Aurora schema (idempotent) then enforce the Phase-1 leakage guard.
# Usage: DEPLOY_PHASE=1 ./migrate.sh   (DB conn via env or defaults to local docker pg)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

PGHOST="${PGHOST:-localhost}"; PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-brain}"; PGDATABASE="${PGDATABASE:-brain}"
export PGPASSWORD="${PGPASSWORD:-brain}"
DEPLOY_PHASE="${DEPLOY_PHASE:-1}"
PSQL=(psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -q)

echo "▸ applying schema (phase ≤ $DEPLOY_PHASE) to $PGHOST:$PGPORT/$PGDATABASE"
for f in $(ls schema/*.sql | sort); do echo "  • $f"; "${PSQL[@]}" -f "$f"; done
# Additive per-phase migrations: schema/phaseN/ is applied only when DEPLOY_PHASE >= N.
for p in $(seq 2 "$DEPLOY_PHASE"); do
  [ -d "schema/phase$p" ] || continue
  for f in $(ls schema/phase$p/*.sql 2>/dev/null | sort); do echo "  • $f"; "${PSQL[@]}" -f "$f"; done
done
for f in $(ls seed/*.sql | sort); do echo "  • $f"; "${PSQL[@]}" -f "$f"; done
for p in $(seq 2 "$DEPLOY_PHASE"); do
  [ -d "seed/phase$p" ] || continue
  for f in $(ls seed/phase$p/*.sql 2>/dev/null | sort); do echo "  • $f"; "${PSQL[@]}" -f "$f"; done
done

echo "▸ Phase-${DEPLOY_PHASE} leakage guard (§28.2)"
LEAK=$("${PSQL[@]}" -tAc "SELECT coalesce(string_agg(table_schema||'.'||table_name||'(P'||phase||')', ', '),'') FROM brain_meta.schema_tables WHERE phase > ${DEPLOY_PHASE};")
if [ -n "$LEAK" ]; then echo "  ✗ LEAK — tables exceed deploy phase: $LEAK"; exit 1; fi
COUNT=$("${PSQL[@]}" -tAc "SELECT count(*) FROM brain_meta.schema_tables;")
echo "  ✓ clean — $COUNT tables registered, all ≤ phase ${DEPLOY_PHASE}"
