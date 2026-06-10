-- ============================================================================
-- §17 SHARED PLATFORM — connector platform (integrations/oauth/sync/health) + notifications. Phase 1.
-- Owner: Integration + Notification svcs. Secret MATERIAL never stored in DB — only a Secrets-Manager ref.
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS shared;
GRANT USAGE ON SCHEMA integration, shared TO brain_app;

-- Extend global reference (§17) — connector_catalog + festival_calendar (regions/tax_slabs/currencies in 04_reference).
CREATE TABLE IF NOT EXISTS reference.connector_catalog (
  provider        text PRIMARY KEY,
  category        text NOT NULL,                                       -- storefront|ads|payments|logistics|messaging|crm|…
  tier            text NOT NULL CHECK (tier IN ('1','2','3')),
  quality_default text NOT NULL CHECK (quality_default IN ('green','yellow','red')),
  region_gated    boolean NOT NULL DEFAULT false
);
SELECT brain_meta.register('reference','connector_catalog',1,'integration','aurora');

CREATE TABLE IF NOT EXISTS reference.festival_calendar (
  region     region_t NOT NULL REFERENCES reference.regions(code),
  date       date NOT NULL,
  name       text NOT NULL,
  multiplier numeric(6,3),
  PRIMARY KEY (region, date, name)
);
SELECT brain_meta.register('reference','festival_calendar',1,'region-adapter','aurora');

-- integrations — connector state per brand+provider.
CREATE TABLE IF NOT EXISTS integration.integrations (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id      uuid NOT NULL,
  provider      text NOT NULL,                                         -- shopify|meta|google|stripe|razorpay|shiprocket|whatsapp|…
  tier          text NOT NULL CHECK (tier IN ('1','2','3')),
  quality_level text NOT NULL CHECK (quality_level IN ('green','yellow','red')),
  status        text NOT NULL CHECK (status IN ('connected','disconnected','degraded')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, provider)
);
CREATE INDEX IF NOT EXISTS ix_integrations_status ON integration.integrations(brand_id, status);
SELECT brain_apply_updated_at('integration.integrations');
SELECT brain_apply_brand_rls('integration.integrations');
SELECT brain_meta.register('integration','integrations',1,'integration','aurora');

-- oauth_tokens — reference to a Secrets Manager secret; NO secret material in the DB.
CREATE TABLE IF NOT EXISTS integration.oauth_tokens (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id         uuid NOT NULL,
  integration_id   uuid NOT NULL REFERENCES integration.integrations(id) ON DELETE CASCADE,
  secret_ref       text NOT NULL UNIQUE,                               -- Secrets Manager reference only
  expires_at       timestamptz,
  refresh_failed_at timestamptz,                                       -- set on refresh failure → alerts + audit
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_oauth_integration ON integration.oauth_tokens(brand_id, integration_id);
SELECT brain_apply_updated_at('integration.oauth_tokens');
SELECT brain_apply_brand_rls('integration.oauth_tokens');
SELECT brain_meta.register('integration','oauth_tokens',1,'integration','aurora');

-- webhook_receipts — idempotency for inbound webhooks. Providers redeliver; the PK dedups per provider+id
-- (e.g. Shopify's X-Shopify-Webhook-Id). Operational (not tenant-queried) → no RLS. Prune by received_at.
CREATE TABLE IF NOT EXISTS integration.webhook_receipts (
  provider    text NOT NULL,
  webhook_id  text NOT NULL,
  brand_id    uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, webhook_id)
);
CREATE INDEX IF NOT EXISTS ix_webhook_receipts_received ON integration.webhook_receipts(received_at);
SELECT brain_meta.register('integration','webhook_receipts',1,'integration','aurora');

CREATE TABLE IF NOT EXISTS integration.sync_state (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id       uuid NOT NULL,
  integration_id uuid NOT NULL REFERENCES integration.integrations(id) ON DELETE CASCADE,
  cursor         text,
  last_sync_at   timestamptz,
  lag_seconds    integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_sync_integration ON integration.sync_state(brand_id, integration_id);
SELECT brain_apply_updated_at('integration.sync_state');
SELECT brain_apply_brand_rls('integration.sync_state');
SELECT brain_meta.register('integration','sync_state',1,'integration','aurora');

CREATE TABLE IF NOT EXISTS integration.connector_health (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id               uuid NOT NULL,
  integration_id         uuid NOT NULL REFERENCES integration.integrations(id) ON DELETE CASCADE,
  completeness_score     numeric(5,2),
  error_type             text,
  blocks_recommendations boolean NOT NULL DEFAULT false,               -- stale data withholds high-risk recs
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_health_integration ON integration.connector_health(brand_id, integration_id);
SELECT brain_apply_updated_at('integration.connector_health');
SELECT brain_apply_brand_rls('integration.connector_health');
SELECT brain_meta.register('integration','connector_health',1,'integration','aurora');

-- notification_log — severity-routed alerts. brand_id NULL = platform/system; user_id logical ref platform.users.
CREATE TABLE IF NOT EXISTS shared.notification_log (
  id        uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id  uuid,
  user_id   uuid,                                                      -- logical ref platform.users.id
  severity  text NOT NULL CHECK (severity IN ('critical','important','informational')),
  channel   text NOT NULL,                                            -- in_product|email|mobile
  sent_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notif_user ON shared.notification_log(brand_id, user_id, sent_at);
ALTER TABLE shared.notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared.notification_log FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON shared.notification_log;
CREATE POLICY brand_isolation ON shared.notification_log
  USING      (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid)
  WITH CHECK (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid);
SELECT brain_meta.register('shared','notification_log',1,'notification','aurora');
