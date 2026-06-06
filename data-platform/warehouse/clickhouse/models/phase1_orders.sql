-- ============================================================================
-- Brain ClickHouse — order facts from the integration data plane (push lane, P1).
-- Pattern: Kafka-Engine source → Materialized View → MergeTree (the canonical CH streaming ingest).
-- Source topic: brain.integration.webhooks (BFF webhook receiver). Shopify orders only for now.
-- Engine note: production uses ReplicatedMergeTree; single-node local uses (Replacing)MergeTree.
-- ============================================================================
CREATE DATABASE IF NOT EXISTS brain;

-- Normalized order header. ReplacingMergeTree collapses orders/create + orders/updated (and any webhook
-- redelivery) for the same (brand, order) to the latest by ingested_at.
CREATE TABLE IF NOT EXISTS brain.orders (
  brand_id           UUID,
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
ORDER BY (brand_id, order_id)
SETTINGS allow_nullable_key = 1;

-- Kafka-engine source: one envelope JSON per message → single `raw` String column (JSONAsString).
-- Offset reset (earliest/latest) is a librdkafka/server-config concern, not a table SETTING; the consumer
-- group reads new messages by default. (Set <kafka><auto_offset_reset>earliest</auto_offset_reset></kafka>
-- in the server config to also pick up backlog.)
CREATE TABLE IF NOT EXISTS brain.kafka_integration_webhooks (raw String)
ENGINE = Kafka
SETTINGS kafka_broker_list = 'redpanda:9092',
         kafka_topic_list = 'brain.integration.webhooks',
         kafka_group_name = 'ch_orders_consumer',
         kafka_format = 'JSONAsString',
         kafka_num_consumers = 1;

-- MV: parse the envelope + the Shopify order payload → normalized order rows.
CREATE MATERIALIZED VIEW IF NOT EXISTS brain.mv_orders TO brain.orders AS
SELECT
  toUUIDOrZero(JSONExtractString(raw, 'brand_id'))                                           AS brand_id,
  JSONExtractString(raw, 'shop')                                                             AS shop,
  toString(JSONExtractUInt(JSONExtractRaw(raw, 'payload'), 'id'))                            AS order_id,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'name')                                  AS order_name,
  toDecimal64OrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'total_price'), 2)     AS total_price,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'currency')                              AS currency,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'financial_status')                      AS financial_status,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'fulfillment_status')                    AS fulfillment_status,
  toString(JSONExtractUInt(JSONExtractRaw(JSONExtractRaw(raw, 'payload'), 'customer'), 'id')) AS customer_id,
  parseDateTime64BestEffortOrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'created_at'), 3) AS ordered_at,
  JSONExtractString(raw, 'topic')                                                            AS topic
FROM brain.kafka_integration_webhooks
WHERE JSONExtractString(raw, 'provider') = 'shopify'
  AND JSONExtractString(raw, 'topic') IN ('orders/create', 'orders/updated');
