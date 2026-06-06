-- Brain schema metadata & the §1.9 "universal table triple" registry (phase / owner / store).
-- Operationalizes the §28.2 Phase leakage guard: migrate.sh asserts max(phase) ≤ DEPLOY_PHASE.
CREATE SCHEMA IF NOT EXISTS brain_meta;

CREATE TABLE IF NOT EXISTS brain_meta.schema_tables (
  table_schema  text    NOT NULL,
  table_name    text    NOT NULL,
  phase         int     NOT NULL CHECK (phase BETWEEN 1 AND 6),
  owner_service text    NOT NULL,
  store         text    NOT NULL DEFAULT 'aurora'
                        CHECK (store IN ('aurora','clickhouse','iceberg','pgvector','neo4j','opensearch')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_schema, table_name)
);

-- Every domain file calls this once per table it creates so phase leakage cannot happen silently.
CREATE OR REPLACE FUNCTION brain_meta.register(
  p_schema text, p_table text, p_phase int, p_owner text, p_store text DEFAULT 'aurora'
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO brain_meta.schema_tables(table_schema, table_name, phase, owner_service, store)
  VALUES (p_schema, p_table, p_phase, p_owner, p_store)
  ON CONFLICT (table_schema, table_name)
  DO UPDATE SET phase = excluded.phase, owner_service = excluded.owner_service, store = excluded.store;
$$;
