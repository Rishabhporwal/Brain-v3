-- ============================================================================
-- §6 consent_state + §26 COMPLIANCE & CONSENT — DPDP / UAE-PDPL / KSA-PDPL substrate. Phase 1 (enforced).
-- Owner: CDP/Consent + Governance. consent_state is the latest-state projection of consent_history.
-- privacy_requests / data_erasure_requests / audit_disclosures are Phase 3 (excluded by the leakage guard).
-- customer_id is a logical cross-service ref to identity.customers (§1.4).
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS consent;
GRANT USAGE ON SCHEMA consent TO brain_app;

-- consent_sources — how/where consent is captured; legal basis per source.
CREATE TABLE IF NOT EXISTS consent.consent_sources (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id            uuid NOT NULL,
  name                text NOT NULL,
  channel             channel_t,
  legal_basis         text NOT NULL,                                   -- consent|legitimate_interest|contract
  consent_manager_ref text,                                            -- DPDP-registered Consent Manager ref
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
SELECT brain_apply_updated_at('consent.consent_sources');
SELECT brain_apply_brand_rls('consent.consent_sources');
SELECT brain_meta.register('consent','consent_sources',1,'consent','aurora');

-- consent_history — APPEND-ONLY immutable audit of every grant/withdrawal (Aurora hot + Iceberg).
CREATE TABLE IF NOT EXISTS consent.consent_history (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id     uuid NOT NULL,
  customer_id  uuid NOT NULL,                                          -- logical ref identity.customers
  channel      channel_t NOT NULL,
  purpose      consent_purpose_t NOT NULL,
  from_state   consent_state_t,
  to_state     consent_state_t NOT NULL,
  source_id    uuid NOT NULL REFERENCES consent.consent_sources(id),
  effective_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_consent_hist_lookup
  ON consent.consent_history(brand_id, customer_id, channel, purpose, effective_at DESC);
SELECT brain_apply_brand_rls('consent.consent_history');
SELECT brain_meta.register('consent','consent_history',1,'consent','aurora');

-- consent_evidence — provable capture for DPDP/PDPL audits; artifact in S3, reference here.
CREATE TABLE IF NOT EXISTS consent.consent_evidence (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id           uuid NOT NULL,
  consent_history_id uuid NOT NULL REFERENCES consent.consent_history(id),
  evidence_type      text NOT NULL CHECK (evidence_type IN ('checkbox','double_optin','imported','api','whatsapp_optin')),
  evidence_ref       text NOT NULL,                                    -- S3 reference to captured proof
  captured_at        timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_consent_evidence_hist ON consent.consent_evidence(brand_id, consent_history_id);
SELECT brain_apply_brand_rls('consent.consent_evidence');
SELECT brain_meta.register('consent','consent_evidence',1,'consent','aurora');

-- consent_state — latest authoritative state per (customer,channel,purpose). Append-only; latest row wins.
CREATE TABLE IF NOT EXISTS consent.consent_state (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id     uuid NOT NULL,
  customer_id  uuid NOT NULL,                                          -- logical ref identity.customers
  channel      channel_t NOT NULL,
  purpose      consent_purpose_t NOT NULL,
  state        consent_state_t NOT NULL,
  source       text NOT NULL,
  region       region_t NOT NULL,
  effective_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_consent_state_lookup
  ON consent.consent_state(brand_id, customer_id, channel, purpose, effective_at DESC);
SELECT brain_apply_brand_rls('consent.consent_state');
SELECT brain_meta.register('consent','consent_state',1,'consent','aurora');

-- retention_policies — codifies the retention matrix as enforceable rows. brand_id NULL = platform default.
CREATE TABLE IF NOT EXISTS consent.retention_policies (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id         uuid,
  data_class       text NOT NULL,                                      -- raw_events|derived_metrics|decision_log|consent|pii|audit
  region           region_t,
  retention_period text NOT NULL,                                      -- '13mo_hot+24mo_cold'|'life_of_brand'|'regulatory_min'
  on_expiry        text NOT NULL CHECK (on_expiry IN ('purge','archive','anonymize')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
SELECT brain_apply_updated_at('consent.retention_policies');
ALTER TABLE consent.retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent.retention_policies FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON consent.retention_policies;
CREATE POLICY brand_isolation ON consent.retention_policies
  USING      (brand_id IS NULL OR brand_id = current_setting('app.current_brand', true)::uuid)
  WITH CHECK (brand_id IS NULL OR brand_id = current_setting('app.current_brand', true)::uuid);
SELECT brain_meta.register('consent','retention_policies',1,'governance','aurora');
