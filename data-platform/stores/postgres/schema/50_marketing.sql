-- ============================================================================
-- §7 MARKETING DOMAIN — channels, ad accounts, campaign hierarchy, creatives. Owner: Integration svc. Phase 1.
-- Spend is a ClickHouse fact (ad_spend/fact_spend, see warehouse/clickhouse/). integration_id is a logical
-- ref to integration.integrations. Efficiency is expressed in CM2 downstream, never platform ROAS alone.
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS marketing;
GRANT USAGE ON SCHEMA marketing TO brain_app;

CREATE TABLE IF NOT EXISTS marketing.channels (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id   uuid NOT NULL,
  type       text NOT NULL CHECK (type IN ('paid','organic','owned','marketplace')),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
SELECT brain_apply_updated_at('marketing.channels');
SELECT brain_apply_brand_rls('marketing.channels');
SELECT brain_meta.register('marketing','channels',1,'integration','aurora');

CREATE TABLE IF NOT EXISTS marketing.ad_accounts (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id            uuid NOT NULL,
  integration_id      uuid NOT NULL,                                    -- logical ref integration.integrations
  provider            text NOT NULL,                                   -- meta|google|tiktok|snapchat|amazon
  external_account_id text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, provider, external_account_id)
);
CREATE INDEX IF NOT EXISTS ix_adacct_integration ON marketing.ad_accounts(brand_id, integration_id);
SELECT brain_apply_updated_at('marketing.ad_accounts');
SELECT brain_apply_brand_rls('marketing.ad_accounts');
SELECT brain_meta.register('marketing','ad_accounts',1,'integration','aurora');

CREATE TABLE IF NOT EXISTS marketing.campaigns (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id             uuid NOT NULL,
  ad_account_id        uuid NOT NULL REFERENCES marketing.ad_accounts(id) ON DELETE CASCADE,
  external_campaign_id text NOT NULL,
  name                 text NOT NULL,
  classification       text NOT NULL CHECK (classification IN ('acquisition','retention','brand','non_acq','unclassified')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, ad_account_id, external_campaign_id)
);
CREATE INDEX IF NOT EXISTS ix_campaigns_acct  ON marketing.campaigns(brand_id, ad_account_id);
CREATE INDEX IF NOT EXISTS ix_campaigns_class ON marketing.campaigns(brand_id, classification);
SELECT brain_apply_updated_at('marketing.campaigns');
SELECT brain_apply_brand_rls('marketing.campaigns');
SELECT brain_meta.register('marketing','campaigns',1,'integration','aurora');

CREATE TABLE IF NOT EXISTS marketing.ad_sets (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id         uuid NOT NULL,
  campaign_id      uuid NOT NULL REFERENCES marketing.campaigns(id) ON DELETE CASCADE,
  external_adset_id text NOT NULL,
  targeting        jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, campaign_id, external_adset_id)
);
CREATE INDEX IF NOT EXISTS ix_adsets_campaign ON marketing.ad_sets(brand_id, campaign_id);
SELECT brain_apply_updated_at('marketing.ad_sets');
SELECT brain_apply_brand_rls('marketing.ad_sets');
SELECT brain_meta.register('marketing','ad_sets',1,'integration','aurora');

CREATE TABLE IF NOT EXISTS marketing.creatives (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id    uuid NOT NULL,
  type        text NOT NULL CHECK (type IN ('image','video','carousel','text')),
  asset_ref   text,
  metadata    jsonb,
  launched_at timestamptz,                                             -- fatigue half-life anchor
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_creatives_type ON marketing.creatives(brand_id, type);
SELECT brain_apply_updated_at('marketing.creatives');
SELECT brain_apply_brand_rls('marketing.creatives');
SELECT brain_meta.register('marketing','creatives',1,'integration','aurora');

CREATE TABLE IF NOT EXISTS marketing.ads (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id     uuid NOT NULL,
  ad_set_id    uuid NOT NULL REFERENCES marketing.ad_sets(id) ON DELETE CASCADE,
  creative_id  uuid REFERENCES marketing.creatives(id),
  external_ad_id text NOT NULL,
  status       text NOT NULL,                                          -- active|paused|archived
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, ad_set_id, external_ad_id)
);
CREATE INDEX IF NOT EXISTS ix_ads_adset    ON marketing.ads(brand_id, ad_set_id);
CREATE INDEX IF NOT EXISTS ix_ads_creative ON marketing.ads(brand_id, creative_id);
SELECT brain_apply_updated_at('marketing.ads');
SELECT brain_apply_brand_rls('marketing.ads');
SELECT brain_meta.register('marketing','ads',1,'integration','aurora');
