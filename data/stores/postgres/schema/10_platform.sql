-- ============================================================================
-- §2 PLATFORM DOMAIN — tenancy, identity-of-people, access control, audit.
-- Owner: Organization + Auth services. Phase 1. All [Aurora].
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS platform;
GRANT USAGE ON SCHEMA platform TO brain_app;

-- organizations — top-level account; owns ≥1 brand. No brand_id, no RLS (org access via membership).
CREATE TABLE IF NOT EXISTS platform.organizations (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  name          text NOT NULL UNIQUE,
  region        region_t   NOT NULL,
  currency      currency_t NOT NULL,
  timezone      text NOT NULL,                                          -- IANA, e.g. Asia/Kolkata
  billing_basis text NOT NULL CHECK (billing_basis IN ('gmv_percent','enterprise_fixed')),
  billing_ref   text UNIQUE,
  status        entity_status_t NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_organizations_status ON platform.organizations(status);
SELECT brain_apply_updated_at('platform.organizations');
SELECT brain_meta.register('platform','organizations',1,'organization','aurora');

-- brands — THE WORKSPACE KEY source. id is referenced as brand_id everywhere.
CREATE TABLE IF NOT EXISTS platform.brands (
  id                        uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id           uuid NOT NULL REFERENCES platform.organizations(id) ON DELETE RESTRICT,
  name                      text NOT NULL,
  slug                      text NOT NULL,
  region                    region_t   NOT NULL,                        -- residency; pins storage
  currency                  currency_t NOT NULL,
  timezone                  text NOT NULL,
  revenue_definition        text NOT NULL DEFAULT 'realized'
                              CHECK (revenue_definition IN ('gross','net_sales','net_sales_net_tax','net_revenue','realized')),
  default_attribution_model attribution_model_t NOT NULL DEFAULT 'position',
  -- Onboarding profile (ported from legacy Workspace): captured during signup, editable in settings.
  industry                  text,
  monthly_revenue           text,                                          -- range bucket, e.g. '10k-50k'
  platform                  text NOT NULL DEFAULT 'shopify'
                              CHECK (platform IN ('shopify','woocommerce')),
  store_url                 text,                                          -- shop domain (Shopify) or normalized URL (Woo)
  status                    entity_status_t NOT NULL DEFAULT 'provisioning',  -- → active via activation gate
  activated_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_brands_org    ON platform.brands(organization_id);
CREATE INDEX IF NOT EXISTS ix_brands_region ON platform.brands(region, status);
SELECT brain_apply_updated_at('platform.brands');
-- Non-standard RLS: brands isolate on id (the workspace key itself), not brand_id.
ALTER TABLE platform.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.brands FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON platform.brands;
CREATE POLICY brand_isolation ON platform.brands
  USING (id = NULLIF(current_setting('app.current_brand', true), '')::uuid);
SELECT brain_meta.register('platform','brands',1,'brand','aurora');

-- users — GLOBAL (not brand-scoped). Brand reachability is via memberships only. No RLS.
CREATE TABLE IF NOT EXISTS platform.users (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  email_hash    text NOT NULL UNIQUE,                                   -- salted hash; plaintext only in identity vault
  display_name  text,
  job_role      text,                                                  -- onboarding: founder|marketing|analyst|developer|agency|other
  avatar_url    text,                                                  -- from the IdP (Google) profile
  status        entity_status_t NOT NULL DEFAULT 'active',
  mfa_enrolled  boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
SELECT brain_apply_updated_at('platform.users');
SELECT brain_meta.register('platform','users',1,'auth','aurora');

-- roles — global reference-ish (no brand_id); seeded in seed/10_platform_seed.sql.
CREATE TABLE IF NOT EXISTS platform.roles (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  scope      text NOT NULL CHECK (scope IN ('org','brand')),
  name       text NOT NULL,
  is_system  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, name)
);
SELECT brain_meta.register('platform','roles',1,'auth','aurora');

-- permissions — brand/feature/api granularity; seeded.
CREATE TABLE IF NOT EXISTS platform.permissions (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  key        text NOT NULL UNIQUE,                                      -- e.g. orders.read, ads.write, refund.execute
  level      text NOT NULL CHECK (level IN ('brand','feature','api')),
  created_at timestamptz NOT NULL DEFAULT now()
);
SELECT brain_meta.register('platform','permissions',1,'auth','aurora');

CREATE TABLE IF NOT EXISTS platform.role_permissions (
  role_id       uuid NOT NULL REFERENCES platform.roles(id)       ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES platform.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS ix_role_permissions_perm ON platform.role_permissions(permission_id);
SELECT brain_meta.register('platform','role_permissions',1,'auth','aurora');

-- memberships — user × org × brand → role. RLS: brand policy (brand_id may be NULL for org-level).
CREATE TABLE IF NOT EXISTS platform.memberships (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id         uuid NOT NULL REFERENCES platform.users(id)         ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES platform.organizations(id),
  brand_id        uuid REFERENCES platform.brands(id),                 -- NULL = org-level membership
  role_id         uuid NOT NULL REFERENCES platform.roles(id),
  state           text NOT NULL CHECK (state IN ('pending','active','revoked')),
  is_agency       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, brand_id, role_id)
);
CREATE INDEX IF NOT EXISTS ix_memberships_brand ON platform.memberships(brand_id);
CREATE INDEX IF NOT EXISTS ix_memberships_user  ON platform.memberships(user_id);
SELECT brain_apply_updated_at('platform.memberships');
-- Standard brand RLS but allow NULL brand_id (org-level membership rows) through to org roles.
ALTER TABLE platform.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.memberships FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON platform.memberships;
CREATE POLICY brand_isolation ON platform.memberships
  USING      (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid)
  WITH CHECK (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid);
SELECT brain_meta.register('platform','memberships',1,'membership','aurora');

-- teams — brand-scoped grouping. Standard RLS.
CREATE TABLE IF NOT EXISTS platform.teams (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id   uuid NOT NULL REFERENCES platform.brands(id),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
SELECT brain_apply_updated_at('platform.teams');
SELECT brain_apply_brand_rls('platform.teams');
SELECT brain_meta.register('platform','teams',1,'membership','aurora');

-- audit_logs — APPEND-ONLY (no update/delete). brand_id NULL for org/system events.
CREATE TABLE IF NOT EXISTS platform.audit_logs (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id   uuid,                                                      -- NULL for org/system
  actor_type actor_type_t NOT NULL,
  actor_id   text NOT NULL,                                             -- user id / agent name / system component
  action     text NOT NULL,                                            -- role.assigned, integration.connected, killswitch.activated…
  target     text,
  before     jsonb,
  after      jsonb,
  ts         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_brand_ts ON platform.audit_logs(brand_id, ts DESC);
CREATE INDEX IF NOT EXISTS ix_audit_action   ON platform.audit_logs(action, ts);
CREATE INDEX IF NOT EXISTS bx_audit_ts       ON platform.audit_logs USING brin(ts);
ALTER TABLE platform.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_logs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON platform.audit_logs;
CREATE POLICY brand_isolation ON platform.audit_logs
  USING (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid);
SELECT brain_meta.register('platform','audit_logs',1,'governance','aurora');

-- sessions — durable record (live state mirrored in Redis).
CREATE TABLE IF NOT EXISTS platform.sessions (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id            uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  device_label       text,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON platform.sessions(user_id);
SELECT brain_meta.register('platform','sessions',1,'auth','aurora');

-- verification_tokens — email verify / password reset / invite.
CREATE TABLE IF NOT EXISTS platform.verification_tokens (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('email_verify','password_reset','invite')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_verif_user_type ON platform.verification_tokens(user_id, type);
SELECT brain_meta.register('platform','verification_tokens',1,'auth','aurora');
