-- ============================================================================
-- §6 CUSTOMER DOMAIN (CDP) — profiles, segments, reusable audiences, preferences. Owner: CDP svc. Phase 3.
-- (Consent shipped enforced in Phase 1.) customer_id is a logical cross-service ref to identity.customers (§1.4).
-- Customer 360 is an assembled read model (Redis/ClickHouse), not a base table.
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS cdp;
GRANT USAGE ON SCHEMA cdp TO brain_app;

-- profiles — one per customer (1:1); behavioural traits, RFM, predicted LTV, health, lifecycle stage.
CREATE TABLE IF NOT EXISTS cdp.profiles (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id            uuid NOT NULL,
  customer_id         uuid NOT NULL,                            -- logical ref identity.customers.id
  traits              jsonb,
  rfm_segment         text,
  predicted_ltv_minor bigint,                                  -- CM2-based; estimate
  health_score        numeric(5,2),                            -- at-risk/churn-likelihood (deterministic first)
  lifecycle_state     text CHECK (lifecycle_state IN ('new','returning','reactivated','at_risk','churned')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, customer_id)
);
CREATE INDEX IF NOT EXISTS ix_profiles_rfm       ON cdp.profiles(brand_id, rfm_segment);
CREATE INDEX IF NOT EXISTS ix_profiles_lifecycle ON cdp.profiles(brand_id, lifecycle_state);
SELECT brain_apply_updated_at('cdp.profiles');
SELECT brain_apply_brand_rls('cdp.profiles');
SELECT brain_meta.register('cdp','profiles',3,'cdp','aurora');

-- segments — RFM/rule/model definitions.
CREATE TABLE IF NOT EXISTS cdp.segments (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id   uuid NOT NULL,
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('rfm','rule','model')),
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
SELECT brain_apply_updated_at('cdp.segments');
SELECT brain_apply_brand_rls('cdp.segments');
SELECT brain_meta.register('cdp','segments',3,'cdp','aurora');

-- audience_defs — build once, activate across channels (membership materialized in ClickHouse).
CREATE TABLE IF NOT EXISTS cdp.audience_defs (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id      uuid NOT NULL,
  name          text NOT NULL,
  rules         jsonb NOT NULL,                                -- membership rules (segments, behaviour)
  build_once    boolean NOT NULL DEFAULT true,
  last_built_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
SELECT brain_apply_updated_at('cdp.audience_defs');
SELECT brain_apply_brand_rls('cdp.audience_defs');
SELECT brain_meta.register('cdp','audience_defs',3,'cdp','aurora');

-- preferences — per-channel frequency cap + quiet hours (enforced alongside consent on every send).
CREATE TABLE IF NOT EXISTS cdp.preferences (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id       uuid NOT NULL,
  customer_id    uuid NOT NULL,                                -- logical ref identity.customers.id
  channel        channel_t NOT NULL,
  frequency_cap  integer,
  quiet_hours    jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, customer_id, channel)
);
SELECT brain_apply_updated_at('cdp.preferences');
SELECT brain_apply_brand_rls('cdp.preferences');
SELECT brain_meta.register('cdp','preferences',3,'cdp','aurora');
