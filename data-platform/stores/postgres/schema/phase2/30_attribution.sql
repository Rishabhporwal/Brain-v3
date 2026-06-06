-- ============================================================================
-- §8/§23 ATTRIBUTION — config, versioned models, reproducible runs. Owner: Attribution svc. Phase 2.
-- Touchpoints/journeys/results live in ClickHouse (warehouse); credit reconciles to the realized ledger.
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS attribution;
GRANT USAGE ON SCHEMA attribution TO brain_app;

-- attribution_models — per-brand model config; model change is a config event → audit_logs.
CREATE TABLE IF NOT EXISTS attribution.attribution_models (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id   uuid NOT NULL,
  model      attribution_model_t NOT NULL,
  params     jsonb,                                              -- weights (e.g. position 40/20/40)
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, model)
);
SELECT brain_apply_updated_at('attribution.attribution_models');
SELECT brain_apply_brand_rls('attribution.attribution_models');
SELECT brain_meta.register('attribution','attribution_models',2,'attribution','aurora');

-- attribution_model_versions — explicit versioning; results reference the exact version that produced them.
CREATE TABLE IF NOT EXISTS attribution.attribution_model_versions (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id       uuid NOT NULL,
  model          attribution_model_t NOT NULL,
  version        integer NOT NULL,
  params         jsonb,
  is_default     boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, model, version)
);
SELECT brain_apply_brand_rls('attribution.attribution_model_versions');
SELECT brain_meta.register('attribution','attribution_model_versions',2,'attribution','aurora');

-- attribution_runs — every results set belongs to a reproducible run reconciled to the dedup ledger.
CREATE TABLE IF NOT EXISTS attribution.attribution_runs (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id             uuid NOT NULL,
  model_version_id     uuid NOT NULL REFERENCES attribution.attribution_model_versions(id),
  window_from          timestamptz NOT NULL,
  window_to            timestamptz NOT NULL,
  status               text NOT NULL CHECK (status IN ('running','completed','failed')),
  reconciled_to_ledger boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_attr_runs_model ON attribution.attribution_runs(brand_id, model_version_id);
SELECT brain_apply_brand_rls('attribution.attribution_runs');
SELECT brain_meta.register('attribution','attribution_runs',2,'attribution','aurora');
