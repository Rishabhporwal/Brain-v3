-- ============================================================================
-- §12 REALIZED-REVENUE LEDGER — financial golden record with a 45-day realization tail. Phase 2.
-- Owner: Realized-Revenue Ledger svc. Aurora hot state; Iceberg /ledger is the system of record.
-- APPEND-ONLY: state transitions are appended (never mutated); the reconciliation job owns the tail and
-- emits corrections to closed periods (ledger_corrections lives in Iceberg).
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS ledger;
GRANT USAGE ON SCHEMA ledger TO brain_app;

CREATE TABLE IF NOT EXISTS ledger.revenue_state (
  brand_id              uuid NOT NULL,                           -- logical FK→platform.brands.id, RLS
  order_id              uuid NOT NULL,                           -- logical ref commerce.orders.id
  seq                   integer NOT NULL,                        -- state-transition sequence (append-only)
  state                 revenue_state_t NOT NULL,                -- placed→…→settled / cancelled / returned / refunded
  placed_revenue_minor  bigint,
  realized_revenue_minor bigint,                                 -- delivered/settled after leakage
  cm1_minor             bigint,
  cm2_minor             bigint,
  cm3_minor             bigint,
  true_cm2_minor        bigint,                                  -- CM2 after RTO/refund/payment provisions
  currency_code         char(3) NOT NULL REFERENCES reference.currencies(code),
  formula_version       integer NOT NULL,
  is_estimate           boolean NOT NULL DEFAULT false,          -- set when cost/data coverage incomplete
  ts                    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, order_id, seq)
);
CREATE INDEX IF NOT EXISTS ix_revenue_state_state ON ledger.revenue_state(brand_id, state, ts);
CREATE INDEX IF NOT EXISTS ix_revenue_state_ts    ON ledger.revenue_state(brand_id, ts);
SELECT brain_apply_brand_rls('ledger.revenue_state');
SELECT brain_meta.register('ledger','revenue_state',2,'realized-revenue-ledger','aurora');

-- ledger_corrections is the Iceberg-only append-only correction stream (see lakehouse); not a Postgres table.
