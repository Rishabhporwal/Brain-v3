-- ============================================================================
-- Brain ClickHouse — shipment facts from the integration data plane (PUSH lane).
-- Pattern: Kafka-Engine source → Materialized View → MergeTree (same as orders/payments).
-- Source topic: brain.integration.webhooks (the shared kafka_integration_webhooks source in
-- phase1_orders.sql — ClickHouse fans every block out to all attached MVs); stream='shipments'.
-- Every logistics connector (Shiprocket, …) normalizes to the canonical ShipmentRecord.
-- ============================================================================
CREATE DATABASE IF NOT EXISTS brain;

CREATE TABLE IF NOT EXISTS brain.shipments (
  brand_id     UUID,
  provider     LowCardinality(String),   -- shiprocket | …
  shipment_id  String,
  awb          String,
  order_ref    String,
  status       LowCardinality(String),   -- canonical: pickup_scheduled | in_transit | delivered | rto | …
  courier      LowCardinality(String),
  updated_at   DateTime64(3),
  ingested_at  DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(updated_at)
ORDER BY (brand_id, provider, shipment_id)
SETTINGS allow_nullable_key = 1;

-- MV: read the canonical ShipmentRecord from the envelope payload, stream='shipments'.
CREATE MATERIALIZED VIEW IF NOT EXISTS brain.mv_shipments TO brain.shipments AS
SELECT
  toUUIDOrZero(JSONExtractString(raw, 'brand_id'))                                          AS brand_id,
  JSONExtractString(raw, 'provider')                                                        AS provider,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'shipment_id')                          AS shipment_id,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'awb')                                  AS awb,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'order_ref')                            AS order_ref,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'status')                               AS status,
  JSONExtractString(JSONExtractRaw(raw, 'payload'), 'courier')                              AS courier,
  parseDateTime64BestEffortOrZero(JSONExtractString(JSONExtractRaw(raw, 'payload'), 'updated_at'), 3) AS updated_at
FROM brain.kafka_integration_webhooks
WHERE JSONExtractString(raw, 'stream') = 'shipments';

-- §1.5 tenant isolation — brand row policy on the LIVE shipments table (fed by the Kafka MV).
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.shipments USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
