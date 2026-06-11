-- ============================================================================
-- Brain ClickHouse — the realized-revenue ledger (Solution Architecture §6.2).
-- Written by commerce-intelligence/realized-revenue-ledger's reconciliation job (NOT by a Kafka MV:
-- realization is a JOIN across orders + payments + shipments over a ~45-day window, owned by the
-- slow-tail job). ReplacingMergeTree(reconciled_at): a re-reconciliation REPLACES the row — a
-- correction to a closed period is a new version, never a silent mutation.
-- ============================================================================
CREATE DATABASE IF NOT EXISTS brain;

CREATE TABLE IF NOT EXISTS brain.revenue_ledger (
  brand_id                UUID,
  provider                LowCardinality(String),
  order_id                String,
  currency                LowCardinality(String),
  order_revenue_minor     Int64,
  refunded_minor          Int64,
  state                   LowCardinality(String),  -- placed | delivered | cancelled | refunded | rto | lost
  realized                UInt8,
  realized_revenue_minor  Int64,                   -- net of partial refunds; 0 unless realized
  ordered_at              DateTime64(3),
  reconciled_at           DateTime64(3)
) ENGINE = ReplacingMergeTree(reconciled_at)
PARTITION BY toYYYYMM(ordered_at)
ORDER BY (brand_id, provider, order_id)
SETTINGS allow_nullable_key = 1;

-- §1.5 tenant isolation — brand row policy, same as every live table.
CREATE ROW POLICY IF NOT EXISTS brand_isolation ON brain.revenue_ledger USING brand_id = toUUID(getSetting('brain_current_brand')) TO ALL;
