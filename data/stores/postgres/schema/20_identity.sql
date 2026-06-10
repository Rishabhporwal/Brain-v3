-- ============================================================================
-- §3 IDENTITY DOMAIN + §22 IDENTITY RESOLUTION (process). Owner: Customer/Identity svc. Phase 1.
-- Deterministic-first; Neo4j probabilistic overlay + identity_clusters/confidence are Phase 4/6 (excluded).
-- brand_id is a LOGICAL ref to platform.brands (cross-service, not an enforced FK — §1.4).
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS identity;
GRANT USAGE ON SCHEMA identity TO brain_app;

-- customers — canonical customer per brand. Same person across two brands = two customers (isolation).
CREATE TABLE IF NOT EXISTS identity.customers (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id           uuid NOT NULL,                                     -- logical FK→platform.brands.id, RLS
  identity_state     text NOT NULL DEFAULT 'anonymous' CHECK (identity_state IN ('anonymous','known','merged')),
  primary_email_hash text,
  primary_phone_hash text,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  first_order_at     timestamptz,
  merged_into_id     uuid REFERENCES identity.customers(id) ON DELETE SET NULL,
  region             region_t NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_customers_state  ON identity.customers(brand_id, identity_state);
CREATE INDEX IF NOT EXISTS ix_customers_email  ON identity.customers(brand_id, primary_email_hash);
CREATE INDEX IF NOT EXISTS ix_customers_phone  ON identity.customers(brand_id, primary_phone_hash);
CREATE INDEX IF NOT EXISTS ix_customers_merged ON identity.customers(merged_into_id);
SELECT brain_apply_updated_at('identity.customers');
SELECT brain_apply_brand_rls('identity.customers');
SELECT brain_meta.register('identity','customers',1,'customer-identity','aurora');

-- customer_identities — (type,value_hash) maps to exactly one customer per brand.
CREATE TABLE IF NOT EXISTS identity.customer_identities (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id    uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES identity.customers(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('email','phone','device','fbclid','gclid','shopify_id','session')),
  value_hash  text NOT NULL,
  match_type  match_type_t NOT NULL DEFAULT 'deterministic',
  confidence  numeric(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  source      text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, type, value_hash)
);
CREATE INDEX IF NOT EXISTS ix_cust_ident_customer ON identity.customer_identities(brand_id, customer_id);
CREATE INDEX IF NOT EXISTS ix_cust_ident_type     ON identity.customer_identities(brand_id, type);
SELECT brain_apply_updated_at('identity.customer_identities');
SELECT brain_apply_brand_rls('identity.customer_identities');
SELECT brain_meta.register('identity','customer_identities',1,'customer-identity','aurora');

-- devices
CREATE TABLE IF NOT EXISTS identity.devices (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id      uuid NOT NULL,
  device_id     text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, device_id)
);
SELECT brain_apply_updated_at('identity.devices');
SELECT brain_apply_brand_rls('identity.devices');
SELECT brain_meta.register('identity','devices',1,'customer-identity','aurora');

-- identity_resolution_rules — brand_id NULL = platform default rule (visible to all brands).
CREATE TABLE IF NOT EXISTS identity.identity_resolution_rules (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id        uuid,                                                 -- NULL = platform default
  identifier_type text NOT NULL,                                        -- email|phone|device|ga_client_id|fbclid|gclid|shopify_id|whatsapp_id
  match_type      match_type_t NOT NULL,
  priority        integer NOT NULL,                                     -- deterministic first
  min_confidence  numeric(5,4),
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_resrules_lookup ON identity.identity_resolution_rules(brand_id, identifier_type, priority);
SELECT brain_apply_updated_at('identity.identity_resolution_rules');
ALTER TABLE identity.identity_resolution_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.identity_resolution_rules FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON identity.identity_resolution_rules;
CREATE POLICY brand_isolation ON identity.identity_resolution_rules
  USING      (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid)
  WITH CHECK (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid);
SELECT brain_meta.register('identity','identity_resolution_rules',1,'customer-identity','aurora');

-- identity_resolution_jobs — auditable resolution runs (stream + historical backfill).
CREATE TABLE IF NOT EXISTS identity.identity_resolution_jobs (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id          uuid NOT NULL,
  job_type          text NOT NULL CHECK (job_type IN ('stream','batch_backfill','rebuild')),
  status            text NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  records_processed bigint,
  matches_made      bigint,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_resjobs_status ON identity.identity_resolution_jobs(brand_id, status);
SELECT brain_apply_updated_at('identity.identity_resolution_jobs');
SELECT brain_apply_brand_rls('identity.identity_resolution_jobs');
SELECT brain_meta.register('identity','identity_resolution_jobs',1,'customer-identity','aurora');

-- identity_matches — APPEND-ONLY; every pairwise match decision, auditable. (ClickHouse copy is separate.)
CREATE TABLE IF NOT EXISTS identity.identity_matches (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id          uuid NOT NULL,
  customer_id       uuid NOT NULL REFERENCES identity.customers(id),
  left_identity_id  uuid NOT NULL REFERENCES identity.customer_identities(id),
  right_identity_id uuid REFERENCES identity.customer_identities(id),   -- NULL = single-key assertion
  rule_id           uuid NOT NULL REFERENCES identity.identity_resolution_rules(id),
  match_type        match_type_t NOT NULL,
  confidence        numeric(5,4),
  job_id            uuid REFERENCES identity.identity_resolution_jobs(id),
  matched_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_matches_customer ON identity.identity_matches(brand_id, customer_id);
CREATE INDEX IF NOT EXISTS ix_matches_type     ON identity.identity_matches(brand_id, match_type);
SELECT brain_apply_brand_rls('identity.identity_matches');
SELECT brain_meta.register('identity','identity_matches',1,'customer-identity','aurora');

-- identity_merge_history — APPEND-ONLY, reversible (supersedes §3 identity_merges). Iceberg copy separate.
CREATE TABLE IF NOT EXISTS identity.identity_merge_history (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id           uuid NOT NULL,
  source_customer_id uuid NOT NULL REFERENCES identity.customers(id),   -- folded-in (loser)
  target_customer_id uuid NOT NULL REFERENCES identity.customers(id),   -- surviving
  match_id           uuid REFERENCES identity.identity_matches(id) ON DELETE SET NULL,
  reason             text NOT NULL,                                     -- deterministic_key|manual|probabilistic_cluster
  by_actor           text NOT NULL,
  reversed_at        timestamptz,
  ts                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_merge_target ON identity.identity_merge_history(brand_id, target_customer_id);
CREATE INDEX IF NOT EXISTS ix_merge_source ON identity.identity_merge_history(brand_id, source_customer_id);
SELECT brain_apply_brand_rls('identity.identity_merge_history');
SELECT brain_meta.register('identity','identity_merge_history',1,'customer-identity','aurora');
