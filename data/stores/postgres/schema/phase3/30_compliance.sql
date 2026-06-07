-- ============================================================================
-- §26 COMPLIANCE — DSAR / erasure / regulatory disclosures (DPDP / UAE-PDPL / KSA-PDPL). Owner: Governance. Phase 3.
-- Extends the Phase-1 consent schema. customer_id is a logical ref to identity.customers (§1.4).
-- ============================================================================
SET client_min_messages = warning;

-- privacy_requests — DSARs (access/portability/rectification/erasure/restrict) per governing regime.
CREATE TABLE IF NOT EXISTS consent.privacy_requests (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id     uuid NOT NULL,
  customer_id  uuid,                                           -- logical ref identity.customers.id (if identified)
  request_type text NOT NULL CHECK (request_type IN ('access','portability','rectification','erasure','restrict')),
  status       text NOT NULL CHECK (status IN ('received','verifying','processing','completed','rejected')),
  regulation   text NOT NULL CHECK (regulation IN ('dpdp','uae_pdpl','ksa_pdpl','gdpr')),
  received_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_privacy_req ON consent.privacy_requests(brand_id, request_type, status);
SELECT brain_apply_updated_at('consent.privacy_requests');
SELECT brain_apply_brand_rls('consent.privacy_requests');
SELECT brain_meta.register('consent','privacy_requests',3,'governance','aurora');

-- data_erasure_requests — purge across EVERY tier incl. backups (crypto-shred/tombstone); decision_log keeps anon refs.
CREATE TABLE IF NOT EXISTS consent.data_erasure_requests (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id           uuid NOT NULL,
  privacy_request_id uuid NOT NULL REFERENCES consent.privacy_requests(id),
  customer_id        uuid NOT NULL,                            -- logical ref identity.customers.id
  scope              jsonb NOT NULL,                           -- stores/tables in scope (every tier incl. backups)
  method             text NOT NULL CHECK (method IN ('crypto_shred','hard_delete','tombstone')),
  tiers_completed    jsonb,                                    -- per-tier completion (Aurora/CH/Iceberg/Redis/OS/Neo4j/backups)
  status             text NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_erasure_req ON consent.data_erasure_requests(brand_id, status);
SELECT brain_apply_updated_at('consent.data_erasure_requests');
SELECT brain_apply_brand_rls('consent.data_erasure_requests');
SELECT brain_meta.register('consent','data_erasure_requests',3,'governance','aurora');

-- audit_disclosures — APPEND-ONLY regulatory reporting trail (breach/regulator/sub-processor/DPA). Iceberg copy is cold.
CREATE TABLE IF NOT EXISTS consent.audit_disclosures (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id        uuid NOT NULL,
  disclosure_type text NOT NULL CHECK (disclosure_type IN ('breach_notification','regulator_report','sub_processor_change','dpa')),
  regulation      text NOT NULL,
  detail          jsonb NOT NULL,
  disclosed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_disclosures ON consent.audit_disclosures(brand_id, disclosed_at DESC);
SELECT brain_apply_brand_rls('consent.audit_disclosures');
SELECT brain_meta.register('consent','audit_disclosures',3,'governance','aurora');
