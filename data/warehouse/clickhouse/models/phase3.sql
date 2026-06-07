-- ============================================================================
-- Brain ClickHouse — Phase-3 (Customer Intelligence / CDP). Source: Brain_Database_Schema §6/§9/§11.
-- audience membership (build-once), delivery tracking, support facts. brand_id-first ORDER BY + row policy.
-- ============================================================================

-- §6 audience_members — materialized membership; one audience layer, no per-channel duplicates.
CREATE TABLE IF NOT EXISTS brain.audience_members (
  brand_id UUID, audience_id UUID, customer_id UUID, added_at DateTime64(3)
) ENGINE = MergeTree PARTITION BY toYYYYMM(added_at) ORDER BY (brand_id, audience_id, customer_id);

-- §9 delivery_tracking — per-shipment checkpoints (leading RTO/NDR signal).
CREATE TABLE IF NOT EXISTS brain.delivery_tracking (
  brand_id UUID, shipment_id UUID, checkpoint String, ts DateTime64(3)
) ENGINE = MergeTree PARTITION BY toYYYYMM(ts) ORDER BY (brand_id, shipment_id, ts);

-- §11 fact_support — ticket grain; support-as-commerce measures.
CREATE TABLE IF NOT EXISTS brain.fact_support (
  brand_id UUID, ticket_id UUID, customer_id Nullable(UUID), order_id Nullable(UUID),
  category LowCardinality(String), resolution_type LowCardinality(String),
  resolution_minutes Nullable(UInt32), cm2_impact_minor Int64, refund_saved_minor Int64, month Date
) ENGINE = MergeTree PARTITION BY toYYYYMM(month) ORDER BY (brand_id, ticket_id) SETTINGS allow_nullable_key = 1;

CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.audience_members  USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.delivery_tracking USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.fact_support      USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
