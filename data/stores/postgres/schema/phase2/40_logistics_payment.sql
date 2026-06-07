-- ============================================================================
-- §9 LOGISTICS + §10 PAYMENT — RTO/COD intelligence + money collection/fees/settlement. Phase 2.
-- No payment secrets (PCI out of scope): only fees, settlements, refund/chargeback status.
-- order_id is a logical ref to commerce.orders (§1.4); currency_code → reference.currencies (enforced).
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS logistics;
CREATE SCHEMA IF NOT EXISTS payment;
GRANT USAGE ON SCHEMA logistics, payment TO brain_app;

-- ---- §9 Logistics (facts → ClickHouse fact_logistics) ----
CREATE TABLE IF NOT EXISTS logistics.couriers (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id   uuid NOT NULL,
  name       text NOT NULL,
  perf_score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
SELECT brain_apply_updated_at('logistics.couriers');
SELECT brain_apply_brand_rls('logistics.couriers');
SELECT brain_meta.register('logistics','couriers',2,'logistics-rto','aurora');

CREATE TABLE IF NOT EXISTS logistics.shipments (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id      uuid NOT NULL,
  order_id      uuid NOT NULL,                                   -- logical ref commerce.orders.id
  courier_id    uuid REFERENCES logistics.couriers(id),
  status        text NOT NULL CHECK (status IN ('created','in_transit','out_for_delivery','delivered','ndr','rto','lost')),
  pincode       text,
  city          text,
  state_emirate text,
  shipped_at    timestamptz,
  delivered_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_shipments_order   ON logistics.shipments(brand_id, order_id);
CREATE INDEX IF NOT EXISTS ix_shipments_courier ON logistics.shipments(brand_id, courier_id);
CREATE INDEX IF NOT EXISTS ix_shipments_pincode ON logistics.shipments(brand_id, pincode);
CREATE INDEX IF NOT EXISTS ix_shipments_status  ON logistics.shipments(brand_id, status);
SELECT brain_apply_updated_at('logistics.shipments');
SELECT brain_apply_brand_rls('logistics.shipments');
SELECT brain_meta.register('logistics','shipments',2,'logistics-rto','aurora');

CREATE TABLE IF NOT EXISTS logistics.ndr_events (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id    uuid NOT NULL,
  shipment_id uuid NOT NULL REFERENCES logistics.shipments(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  attempt_no  integer NOT NULL,
  ts          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ndr_shipment ON logistics.ndr_events(brand_id, shipment_id, attempt_no);
SELECT brain_apply_brand_rls('logistics.ndr_events');
SELECT brain_meta.register('logistics','ndr_events',2,'logistics-rto','aurora');

CREATE TABLE IF NOT EXISTS logistics.rto_events (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id       uuid NOT NULL,
  shipment_id    uuid NOT NULL REFERENCES logistics.shipments(id) ON DELETE CASCADE,
  rto_cost_minor bigint NOT NULL,                                -- fwd+return shipping+COD fee+packaging+damage+lost contribution
  currency_code  char(3) NOT NULL REFERENCES reference.currencies(code),
  ts             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_rto_shipment ON logistics.rto_events(brand_id, shipment_id);
SELECT brain_apply_brand_rls('logistics.rto_events');
SELECT brain_meta.register('logistics','rto_events',2,'logistics-rto','aurora');

-- ---- §10 Payment (metadata only; refunds run through the gateway) ----
CREATE TABLE IF NOT EXISTS payment.payments (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id            uuid NOT NULL,
  order_id            uuid NOT NULL,                             -- logical ref commerce.orders.id
  provider            text NOT NULL,                            -- razorpay|cashfree|payu|stripe|bnpl
  external_payment_id text NOT NULL,
  method              payment_method_t NOT NULL,
  amount_minor        bigint NOT NULL,
  currency_code       char(3) NOT NULL REFERENCES reference.currencies(code),
  fee_minor           bigint,
  status              text NOT NULL CHECK (status IN ('captured','failed','settled','refunded','charged_back')),
  settled_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, provider, external_payment_id)
);
CREATE INDEX IF NOT EXISTS ix_payments_order  ON payment.payments(brand_id, order_id);
CREATE INDEX IF NOT EXISTS ix_payments_status ON payment.payments(brand_id, status);
SELECT brain_apply_updated_at('payment.payments');
SELECT brain_apply_brand_rls('payment.payments');
SELECT brain_meta.register('payment','payments',2,'finance-cash','aurora');

CREATE TABLE IF NOT EXISTS payment.settlements (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id      uuid NOT NULL,
  provider      text NOT NULL,
  batch_ref     text NOT NULL,
  amount_minor  bigint NOT NULL,
  currency_code char(3) NOT NULL REFERENCES reference.currencies(code),
  settled_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, provider, batch_ref)
);
SELECT brain_apply_brand_rls('payment.settlements');
SELECT brain_meta.register('payment','settlements',2,'finance-cash','aurora');

CREATE TABLE IF NOT EXISTS payment.refunds (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id      uuid NOT NULL,
  payment_id    uuid NOT NULL REFERENCES payment.payments(id) ON DELETE CASCADE,
  amount_minor  bigint NOT NULL,                                 -- signed negative in the ledger
  currency_code char(3) NOT NULL REFERENCES reference.currencies(code),
  reason        text,
  status        text NOT NULL CHECK (status IN ('requested','processing','completed','failed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_refunds_payment ON payment.refunds(brand_id, payment_id);
SELECT brain_apply_updated_at('payment.refunds');
SELECT brain_apply_brand_rls('payment.refunds');
SELECT brain_meta.register('payment','refunds',2,'finance-cash','aurora');

CREATE TABLE IF NOT EXISTS payment.chargebacks (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id      uuid NOT NULL,
  payment_id    uuid NOT NULL REFERENCES payment.payments(id) ON DELETE CASCADE,
  amount_minor  bigint NOT NULL,
  currency_code char(3) NOT NULL REFERENCES reference.currencies(code),
  status        text NOT NULL CHECK (status IN ('open','won','lost')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_chargebacks_payment ON payment.chargebacks(brand_id, payment_id);
SELECT brain_apply_updated_at('payment.chargebacks');
SELECT brain_apply_brand_rls('payment.chargebacks');
SELECT brain_meta.register('payment','chargebacks',2,'finance-cash','aurora');
