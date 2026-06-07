-- ============================================================================
-- §24 (+§12) METRIC REGISTRY — the deterministic core's definitions. Owner: Metric Engine. Phase 2.
-- Global reference (no brand_id) EXCEPT metric_lineage (brand-scoped). Only the Metric Engine defines a
-- figure; every returned value carries its metric_version → formula_version → source rows (billing-grade).
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS metrics;
GRANT USAGE ON SCHEMA metrics TO brain_app;

-- formula_registry / formula_versions — the canonical computation + its versions (rounding pinned).
CREATE TABLE IF NOT EXISTS metrics.formula_registry (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  formula_key     text NOT NULL UNIQUE,
  expression_lang text NOT NULL CHECK (expression_lang IN ('sql','engine_dsl')),
  description     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
SELECT brain_meta.register('metrics','formula_registry',2,'metric-engine','aurora');

CREATE TABLE IF NOT EXISTS metrics.formula_versions (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  formula_id        uuid NOT NULL REFERENCES metrics.formula_registry(id),
  version           integer NOT NULL,
  expression        text NOT NULL,
  rounding_mode     text NOT NULL DEFAULT 'half_even',          -- banker's rounding for money (§1.7)
  working_precision text NOT NULL DEFAULT 'numeric(38,12)',
  effective_from    timestamptz NOT NULL DEFAULT now(),
  is_current        boolean NOT NULL DEFAULT true,
  UNIQUE (formula_id, version)
);
SELECT brain_meta.register('metrics','formula_versions',2,'metric-engine','aurora');

-- metric_registry / metric_versions — metrics are distinct from formulas; a metric backs onto a formula version.
CREATE TABLE IF NOT EXISTS metrics.metric_registry (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  metric_key       text NOT NULL UNIQUE,                        -- cm1|cm2|cm3|true_cm2|mer|amer|cac|rto_rate|…
  display_name     text NOT NULL,
  grain            text NOT NULL,                               -- order|sku|customer|cohort|campaign|day|…|workspace
  unit_kind        text NOT NULL CHECK (unit_kind IN ('money','ratio','count','duration')),
  description      text NOT NULL,
  is_billing_grade boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
SELECT brain_meta.register('metrics','metric_registry',2,'metric-engine','aurora');

CREATE TABLE IF NOT EXISTS metrics.metric_versions (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  metric_id          uuid NOT NULL REFERENCES metrics.metric_registry(id),
  version            integer NOT NULL,
  formula_version_id uuid NOT NULL REFERENCES metrics.formula_versions(id),
  effective_from     timestamptz NOT NULL DEFAULT now(),
  is_current         boolean NOT NULL DEFAULT true,
  change_reason      text,
  UNIQUE (metric_id, version)
);
SELECT brain_meta.register('metrics','metric_versions',2,'metric-engine','aurora');

-- metric_dependencies — the metric DAG (e.g. cm2 depends on cm1, marketing_spend). No self-edges; cycles rejected at write.
CREATE TABLE IF NOT EXISTS metrics.metric_dependencies (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  metric_id            uuid NOT NULL REFERENCES metrics.metric_registry(id),
  depends_on_metric_id uuid NOT NULL REFERENCES metrics.metric_registry(id),
  CHECK (metric_id <> depends_on_metric_id),
  UNIQUE (metric_id, depends_on_metric_id)
);
SELECT brain_meta.register('metrics','metric_dependencies',2,'metric-engine','aurora');

-- metric_lineage — brand-scoped, append-only: any figure resolves to formula+metric version + source snapshot.
CREATE TABLE IF NOT EXISTS metrics.metric_lineage (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id           uuid NOT NULL,                              -- logical FK→platform.brands.id, RLS
  metric_key         text NOT NULL,                             -- logical ref metrics.metric_registry.metric_key
  metric_version     integer NOT NULL,
  lineage_handle     text NOT NULL UNIQUE,
  source_refs        jsonb NOT NULL,
  iceberg_snapshot_id text,
  computed_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_metric_lineage_brand ON metrics.metric_lineage(brand_id, computed_at DESC);
SELECT brain_apply_brand_rls('metrics.metric_lineage');
SELECT brain_meta.register('metrics','metric_lineage',2,'metric-engine','aurora');
