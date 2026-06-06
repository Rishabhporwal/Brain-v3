-- ============================================================================
-- Brain ClickHouse — Phase-1 analytical/serving tables (companion to the Aurora schema).
-- Source of truth: Brain_Database_Schema §4 (tracking), §7 (spend), §19 (event substrate).
-- High-volume event/spend bodies live here; Aurora holds keys/config. Iceberg is the immutable SoR.
--
-- Engine note: production uses ReplicatedMergeTree; single-node local uses MergeTree.
-- RLS note: ClickHouse emulates brand isolation with a row policy keyed on a custom setting
--   `brain_current_brand` (declare it in users.xml). The query gateway also mandates a brand_id filter.
-- ============================================================================
CREATE DATABASE IF NOT EXISTS brain;

-- §4 customer_events — first-party behavioural events. Append-only; exactly-once via event_id.
CREATE TABLE IF NOT EXISTS brain.customer_events (
  brand_id       UUID,
  event_id       UUID,
  event_type     LowCardinality(String),   -- page_view|product_view|add_to_cart|…|purchase|custom
  source         LowCardinality(String),   -- browser|mobile|server|sdk
  customer_id    Nullable(UUID),
  anonymous_id   String,
  session_id     Nullable(UUID),
  ts             DateTime64(3),
  consent_state  LowCardinality(String),
  region         LowCardinality(String),
  props          String,                   -- JSON (typed event properties)
  schema_version LowCardinality(String),
  INDEX skip_ts ts TYPE minmax GRANULARITY 1,
  INDEX bf_type event_type TYPE bloom_filter GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (brand_id, customer_id, ts)
SETTINGS allow_nullable_key = 1;

-- §4 sessions
CREATE TABLE IF NOT EXISTS brain.sessions (
  brand_id     UUID,
  session_id   UUID,
  customer_id  Nullable(UUID),
  anonymous_id String,
  started_at   DateTime64(3),
  ended_at     Nullable(DateTime64(3)),
  source       LowCardinality(String),
  device_id    String
) ENGINE = MergeTree
PARTITION BY toYYYYMM(started_at)
ORDER BY (brand_id, customer_id, started_at)
SETTINGS allow_nullable_key = 1;

-- §19.1 raw_events — immutable source payloads (Iceberg SoR + ClickHouse serving).
CREATE TABLE IF NOT EXISTS brain.raw_events (
  brand_id          UUID,
  event_id          UUID,                  -- idempotency / dedupe key
  source            LowCardinality(String),
  event_type        LowCardinality(String),
  payload           String,                -- exact source payload (JSON)
  schema_version_id UUID,
  consent_state     LowCardinality(String),
  region            LowCardinality(String),
  received_at       DateTime64(3),
  producer_offset   Nullable(String)
) ENGINE = MergeTree
PARTITION BY (brand_id, toYYYYMM(received_at))
ORDER BY (brand_id, received_at, event_id);

-- §19.1 normalized_events — canonical, region-rule-applied; same event_id for lineage.
CREATE TABLE IF NOT EXISTS brain.normalized_events (
  brand_id          UUID,
  event_id          UUID,
  raw_event_id      UUID,
  canonical_type    LowCardinality(String),
  domain            LowCardinality(String),
  customer_id       Nullable(UUID),
  entity_ref        Nullable(UUID),
  canonical_payload String,
  schema_version_id UUID,
  normalized_at     DateTime64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(normalized_at)
ORDER BY (brand_id, normalized_at, event_id);

-- §19.2 event_processing_log — per-event pipeline audit; feeds data-quality and lineage.
CREATE TABLE IF NOT EXISTS brain.event_processing_log (
  brand_id     UUID,
  event_id     UUID,
  pipeline     LowCardinality(String),     -- normalizer|identity|journey_attribution|anomaly|sale_event
  stage        LowCardinality(String),     -- raw|normalized|canonical|derived|aggregated
  status       LowCardinality(String),     -- ok|retried|dead_lettered
  latency_ms   Nullable(UInt32),
  processed_at DateTime64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(processed_at)
ORDER BY (brand_id, pipeline, processed_at);

-- §19.3 event_retry_log — exponential-backoff retry attempts and circuit-breaker behaviour.
CREATE TABLE IF NOT EXISTS brain.event_retry_log (
  brand_id   Nullable(UUID),
  event_id   UUID,
  pipeline   LowCardinality(String),
  attempt_no UInt16,
  backoff_ms UInt32,
  outcome    LowCardinality(String),       -- retry_ok|retry_failed|dead_lettered
  ts         DateTime64(3)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (brand_id, ts)
SETTINGS allow_nullable_key = 1;

-- §7 fact_spend (ad_spend) — spend in minor units; efficiency expressed in CM2 downstream.
CREATE TABLE IF NOT EXISTS brain.fact_spend (
  brand_id      UUID,
  campaign_id   UUID,
  ad_set_id     Nullable(UUID),
  ad_id         Nullable(UUID),
  date          Date,
  spend_minor   Int64,
  currency_code LowCardinality(String),
  impressions   UInt64,
  clicks        UInt64,
  conversions   UInt64                      -- platform conversions (NOT the truth source)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(date)
ORDER BY (brand_id, campaign_id, date);

-- Brand-isolation row policies (require custom setting `brain_current_brand` in users.xml).
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.customer_events     USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.sessions            USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.raw_events          USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.normalized_events   USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.event_processing_log USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.fact_spend          USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
