-- ============================================================================
-- Brain ClickHouse — order facts from the integration data plane (PUSH lane, P1/P4).
-- Pattern: Kafka-Engine source → Materialized View → MergeTree. VENDOR-AGNOSTIC: every storefront connector
-- normalizes to the canonical OrderRecord and tags stream='orders', so Shopify + WooCommerce + … land here.
-- Source topic: brain.integration.webhooks.
-- ============================================================================
CREATE DATABASE IF NOT EXISTS brain;

CREATE TABLE IF NOT EXISTS brain.orders (
  brand_id           UUID,
  provider           LowCardinality(String),   -- shopify | woocommerce | …
  shop               String,
  order_id           String,
  order_name         String,
  total_price        Decimal(18, 2),
  currency           LowCardinality(String),
  financial_status   LowCardinality(String),
  fulfillment_status LowCardinality(String),
  customer_id        String,
  ordered_at         DateTime64(3),
  topic              LowCardinality(String),
  ingested_at        DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(ordered_at)
ORDER BY (brand_id, provider, order_id)
SETTINGS allow_nullable_key = 1;

-- Kafka-engine source: one envelope JSON per message → single `raw` String column (JSONAsString).
-- Multiple MVs attach here (orders + payments); ClickHouse fans every block out to all of them.
CREATE TABLE IF NOT EXISTS brain.kafka_integration_webhooks (raw String)
ENGINE = Kafka
SETTINGS kafka_broker_list = 'redpanda:9092',
         kafka_topic_list = 'brain.integration.webhooks',
         kafka_group_name = 'ch_webhooks_consumer',
         kafka_format = 'JSONAsString',
         kafka_num_consumers = 1;

-- MV: read the canonical OrderRecord from the envelope payload (any storefront), stream='orders'.
CREATE MATERIALIZED VIEW IF NOT EXISTS brain.mv_orders TO brain.orders AS
SELECT
  toUUIDOrZero(JSONExtractString(raw, 'brand_id'))                                          AS brand_id,
  JSONExtractString(raw, 'provider')                                                        AS provider,
  JSONExtractString(raw, 'shop')                                                            AS shop,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'order_id')                             AS order_id,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'order_name')                           AS order_name,
  toDecimal64OrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'total_price'), 2)     AS total_price,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'currency')                             AS currency,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'financial_status')                     AS financial_status,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'fulfillment_status')                   AS fulfillment_status,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'customer_id')                          AS customer_id,
  parseDateTime64BestEffortOrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'ordered_at'), 3) AS ordered_at,
  JSONExtractString(raw, 'topic')                                                           AS topic
FROM brain.kafka_integration_webhooks
WHERE JSONExtractString(raw, 'stream') = 'orders';

-- ── payments (canonical PaymentRecord; e.g. Razorpay) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain.payments (
  brand_id     UUID,
  provider     LowCardinality(String),
  payment_id   String,
  order_ref    String,
  amount_minor Int64,
  currency     LowCardinality(String),
  status       LowCardinality(String),
  method       LowCardinality(String),
  created_at   DateTime64(3),
  ingested_at  DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (brand_id, provider, payment_id)
SETTINGS allow_nullable_key = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS brain.mv_payments TO brain.payments AS
SELECT
  toUUIDOrZero(JSONExtractString(raw, 'brand_id'))                                          AS brand_id,
  JSONExtractString(raw, 'provider')                                                        AS provider,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'payment_id')                           AS payment_id,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'order_ref')                            AS order_ref,
  toInt64OrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'amount_minor'))          AS amount_minor,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'currency')                             AS currency,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'status')                               AS status,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'method')                               AS method,
  parseDateTime64BestEffortOrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'created_at'), 3) AS created_at
FROM brain.kafka_integration_webhooks
WHERE JSONExtractString(raw, 'stream') = 'payments';
