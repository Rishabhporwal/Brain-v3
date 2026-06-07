-- ============================================================================
-- Brain ClickHouse — Phase-2 warehouse (Commerce Intelligence). Source: Brain_Database_Schema §13/§8/§23/§20.
-- Star schema: facts (additive; semi-additive snapshotted) + SCD dims, brand_id-first ORDER BY + row policy.
-- AggregatingMergeTree MVs (CM waterfall / MER / RTO-COD cubes) maintain incrementally over these.
-- ============================================================================

-- ---- Facts (grain & measures per §13) ----
CREATE TABLE IF NOT EXISTS brain.fact_orders (
  brand_id UUID, order_id UUID, customer_id Nullable(UUID), placed_at DateTime64(3),
  gross_minor Int64, discount_minor Int64, tax_minor Int64, net_sales_minor Int64, realized_revenue_minor Int64,
  region LowCardinality(String)
) ENGINE = MergeTree PARTITION BY toYYYYMM(placed_at) ORDER BY (brand_id, placed_at, order_id) SETTINGS allow_nullable_key = 1;

CREATE TABLE IF NOT EXISTS brain.fact_order_items (
  brand_id UUID, order_id UUID, sku String, qty UInt32,
  revenue_net_tax_minor Int64, cogs_minor Int64, gross_margin_minor Int64, ts DateTime64(3)
) ENGINE = MergeTree PARTITION BY toYYYYMM(ts) ORDER BY (brand_id, order_id, sku);

CREATE TABLE IF NOT EXISTS brain.fact_revenue (
  brand_id UUID, order_id UUID, state LowCardinality(String),
  placed_minor Int64, realized_minor Int64, cm1_minor Int64, cm2_minor Int64, cm3_minor Int64, true_cm2_minor Int64,
  ts DateTime64(3)
) ENGINE = MergeTree PARTITION BY toYYYYMM(ts) ORDER BY (brand_id, order_id, ts);

CREATE TABLE IF NOT EXISTS brain.fact_attribution (
  brand_id UUID, run_id UUID, order_id UUID, touchpoint_id UUID,
  model LowCardinality(String), model_version UInt32,
  credit_fraction Decimal(9,8), attributed_revenue_minor Int64, attributed_cm2_minor Int64, computed_at DateTime64(3)
) ENGINE = MergeTree PARTITION BY toYYYYMM(computed_at) ORDER BY (brand_id, order_id, model, model_version);

CREATE TABLE IF NOT EXISTS brain.fact_logistics (
  brand_id UUID, shipment_id UUID, order_id UUID, courier LowCardinality(String),
  rto_cost_minor Int64, delivery_days Nullable(UInt16), ndr_attempts UInt8, status LowCardinality(String), month Date
) ENGINE = MergeTree PARTITION BY toYYYYMM(month) ORDER BY (brand_id, shipment_id);

CREATE TABLE IF NOT EXISTS brain.fact_payments (
  brand_id UUID, payment_id UUID, order_id UUID, amount_minor Int64, fee_minor Int64,
  settlement_lag_days Nullable(UInt16), method LowCardinality(String), settled_at Nullable(DateTime64(3)), month Date
) ENGINE = MergeTree PARTITION BY toYYYYMM(month) ORDER BY (brand_id, payment_id);

CREATE TABLE IF NOT EXISTS brain.fact_customer_activity (
  brand_id UUID, customer_id UUID, day Date, sessions UInt32, events UInt32, orders UInt32, cm2_minor Int64
) ENGINE = MergeTree PARTITION BY toYYYYMM(day) ORDER BY (brand_id, customer_id, day);

-- ---- Journeys / touchpoints / attribution results (§8/§23) ----
CREATE TABLE IF NOT EXISTS brain.touchpoints (
  brand_id UUID, touchpoint_id UUID, customer_id Nullable(UUID), session_id Nullable(UUID),
  channel LowCardinality(String), campaign_id Nullable(UUID), click_id String, ts DateTime64(3)
) ENGINE = MergeTree PARTITION BY toYYYYMM(ts) ORDER BY (brand_id, customer_id, ts) SETTINGS allow_nullable_key = 1;

CREATE TABLE IF NOT EXISTS brain.journeys (
  brand_id UUID, journey_id UUID, customer_id Nullable(UUID), started_at DateTime64(3),
  converted UInt8, order_id Nullable(UUID)
) ENGINE = MergeTree PARTITION BY toYYYYMM(started_at) ORDER BY (brand_id, customer_id, started_at) SETTINGS allow_nullable_key = 1;

CREATE TABLE IF NOT EXISTS brain.journey_touchpoints (
  brand_id UUID, journey_id UUID, touchpoint_id UUID, position UInt16, is_converting UInt8, ts DateTime64(3)
) ENGINE = MergeTree PARTITION BY toYYYYMM(ts) ORDER BY (brand_id, journey_id, ts);

CREATE TABLE IF NOT EXISTS brain.attribution_results (
  brand_id UUID, run_id UUID, order_id UUID, touchpoint_id UUID, model LowCardinality(String), model_version UInt32,
  credit_fraction Decimal(9,8), attributed_revenue_minor Int64, attributed_cm2_minor Int64, computed_at DateTime64(3)
) ENGINE = MergeTree PARTITION BY toYYYYMM(computed_at) ORDER BY (brand_id, order_id, model, model_version);

-- ---- KPI snapshots + detected signals (§13/§20) ----
CREATE TABLE IF NOT EXISTS brain.kpi_snapshots (
  brand_id UUID, metric LowCardinality(String), grain LowCardinality(String), period String,
  value Decimal(38,12), rag_status LowCardinality(String), goal_id Nullable(UUID), ts DateTime64(3)
) ENGINE = MergeTree PARTITION BY toYYYYMM(ts) ORDER BY (brand_id, metric, period);

CREATE TABLE IF NOT EXISTS brain.detected_signals (
  brand_id UUID, signal_id UUID, condition_id Nullable(UUID), type LowCardinality(String),
  severity LowCardinality(String), payload String, ts DateTime64(3)
) ENGINE = MergeTree PARTITION BY toYYYYMM(ts) ORDER BY (brand_id, type, ts);

-- ---- Dimensions (SCD; brand-scoped ones carry brand_id) ----
CREATE TABLE IF NOT EXISTS brain.dim_customer (
  brand_id UUID, customer_id UUID, rfm_segment LowCardinality(String), ltv_band LowCardinality(String),
  identity_state LowCardinality(String), first_order_cohort String, region LowCardinality(String),
  valid_from DateTime64(3), valid_to Nullable(DateTime64(3)), is_current UInt8
) ENGINE = ReplacingMergeTree(valid_from) ORDER BY (brand_id, customer_id, valid_from);

CREATE TABLE IF NOT EXISTS brain.dim_product (
  brand_id UUID, sku String, title String, category LowCardinality(String), sub_category LowCardinality(String),
  tax_slab Decimal(5,2), valid_from DateTime64(3), valid_to Nullable(DateTime64(3)), is_current UInt8
) ENGINE = ReplacingMergeTree(valid_from) ORDER BY (brand_id, sku, valid_from);

CREATE TABLE IF NOT EXISTS brain.dim_campaign (
  brand_id UUID, campaign_id UUID, campaign String, ad_set String, ad String,
  channel LowCardinality(String), classification LowCardinality(String),
  valid_from DateTime64(3), valid_to Nullable(DateTime64(3)), is_current UInt8
) ENGINE = ReplacingMergeTree(valid_from) ORDER BY (brand_id, campaign_id, valid_from);

-- dim_time is global (not brand-scoped).
CREATE TABLE IF NOT EXISTS brain.dim_time (
  date Date, dow UInt8, week UInt8, month UInt8, quarter UInt8, festival_flag UInt8, season LowCardinality(String)
) ENGINE = MergeTree ORDER BY (date);

-- Brand-isolation row policies (custom setting brain_current_brand; dim_time is global so excluded).
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.fact_orders            USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.fact_order_items       USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.fact_revenue           USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.fact_attribution       USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.fact_logistics         USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.fact_payments          USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.fact_customer_activity USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.touchpoints            USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.journeys               USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.journey_touchpoints    USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.attribution_results    USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.kpi_snapshots          USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.detected_signals       USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.dim_customer           USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.dim_product            USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.dim_campaign           USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
