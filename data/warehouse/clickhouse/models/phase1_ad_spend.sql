-- ============================================================================
-- Brain ClickHouse — ad-spend facts from the integration data plane (PULL lane, P3).
-- Pattern: Kafka-Engine source → Materialized View → MergeTree (same as orders/P1).
-- Source topic: brain.integration.pull (BFF PullService). Normalizes Google + Meta into one shape.
-- NB: keyed on the EXTERNAL campaign id (string). Mapping external→internal campaign UUID (for §7
-- brain.fact_spend) is a later step once the campaign entity is synced.
-- ============================================================================
CREATE DATABASE IF NOT EXISTS brain;

-- Unified ad spend per (brand, provider, campaign, date). ReplacingMergeTree collapses re-pulls to latest.
CREATE TABLE IF NOT EXISTS brain.ad_spend (
  brand_id      UUID,
  provider      LowCardinality(String),   -- google | meta
  campaign_id   String,                    -- external campaign id
  campaign_name String,
  date          Date,
  spend_minor   Int64,                     -- normalized to currency minor units
  currency_code LowCardinality(String),
  impressions   UInt64,
  clicks        UInt64,
  conversions   Float64,
  pulled_at     DateTime64(3)
) ENGINE = ReplacingMergeTree(pulled_at)
PARTITION BY toYYYYMM(date)
ORDER BY (brand_id, provider, campaign_id, date)
SETTINGS allow_nullable_key = 1;

CREATE TABLE IF NOT EXISTS brain.kafka_integration_pull (raw String)
ENGINE = Kafka
SETTINGS kafka_broker_list = 'redpanda:9092',
         kafka_topic_list = 'brain.integration.pull',
         kafka_group_name = 'ch_ad_spend_consumer',
         kafka_format = 'JSONAsString',
         kafka_num_consumers = 1;

-- MV: parse the pull envelope; normalize spend per provider (Google = cost_micros/1e4, Meta = spend*100).
CREATE MATERIALIZED VIEW IF NOT EXISTS brain.mv_ad_spend TO brain.ad_spend AS
SELECT
  toUUIDOrZero(JSONExtractString(raw, 'brand_id'))                                          AS brand_id,
  JSONExtractString(raw, 'provider')                                                        AS provider,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'campaign_id')                          AS campaign_id,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'campaign_name')                        AS campaign_name,
  toDate(parseDateTimeBestEffortOrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'date'))) AS date,
  if(
    JSONExtractString(raw, 'provider') = 'google',
    toInt64(toFloat64OrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'cost_micros')) / 10000),
    toInt64(round(toFloat64OrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'spend')) * 100))
  )                                                                                          AS spend_minor,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'currency')                             AS currency_code,
  toUInt64OrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'impressions'))          AS impressions,
  toUInt64OrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'clicks'))               AS clicks,
  toFloat64OrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'conversions'))         AS conversions,
  parseDateTime64BestEffortOrZero(JSONExtractString(raw, 'pulled_at'), 3)                   AS pulled_at
FROM brain.kafka_integration_pull
WHERE JSONExtractString(raw, 'stream') = 'ad_spend';

-- §1.5 tenant isolation — brand row policy on the LIVE ad_spend table (fed by the Kafka MV).
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.ad_spend USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
