-- ============================================================================
-- §5 COMMERCE DOMAIN — products, variants, orders, items, inventory, pricing, discounts, cost config.
-- Owner: Commerce svc. Phase 1. Aurora keys (high-volume facts → ClickHouse warehouse, P2).
-- No payment secrets; realized revenue comes from the ledger (P2), never written here (P7 invariant).
-- currency_code → reference.currencies (enforced FK, global reference). customer_id is a logical
-- cross-service ref to identity.customers (not an enforced FK — §1.4).
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS commerce;
GRANT USAGE ON SCHEMA commerce TO brain_app;

CREATE TABLE IF NOT EXISTS commerce.products (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id     uuid NOT NULL,
  sku          text NOT NULL,
  title        text NOT NULL,
  category     text,
  sub_category text,
  tax_slab     numeric(5,2) NOT NULL,                                   -- per-SKU GST/VAT rate (logical ref reference.tax_slabs; never blended)
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, sku)
);
CREATE INDEX IF NOT EXISTS ix_products_category ON commerce.products(brand_id, category);
SELECT brain_apply_updated_at('commerce.products');
SELECT brain_apply_brand_rls('commerce.products');
SELECT brain_meta.register('commerce','products',1,'commerce','aurora');

CREATE TABLE IF NOT EXISTS commerce.variants (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id   uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES commerce.products(id) ON DELETE CASCADE,
  sku        text NOT NULL,
  attributes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, sku)
);
CREATE INDEX IF NOT EXISTS ix_variants_product ON commerce.variants(brand_id, product_id);
SELECT brain_apply_updated_at('commerce.variants');
SELECT brain_apply_brand_rls('commerce.variants');
SELECT brain_meta.register('commerce','variants',1,'commerce','aurora');

-- orders — facts mirrored to ClickHouse fact_orders (P2). Native monthly RANGE partitioning by placed_at
-- is a production optimization deferred here so the (brand_id,source,external_order_id) dedupe key stays
-- globally unique; ingestion idempotency (event_id) is the primary exactly-once guard.
CREATE TABLE IF NOT EXISTS commerce.orders (
  id                    uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id              uuid NOT NULL,
  customer_id           uuid,                                           -- logical ref identity.customers (SET NULL semantics in app)
  source                text NOT NULL,                                  -- shopify|woocommerce|salla|zid|marketplace|custom
  external_order_id     text NOT NULL,
  status                text NOT NULL,
  revenue_state         revenue_state_t NOT NULL DEFAULT 'placed',      -- realized values owned by ledger (P2)
  payment_method        payment_method_t NOT NULL,
  currency_code         char(3) NOT NULL REFERENCES reference.currencies(code),
  gross_amount_minor    bigint NOT NULL CHECK (gross_amount_minor >= 0),
  discount_amount_minor bigint NOT NULL DEFAULT 0,
  tax_amount_minor      bigint NOT NULL DEFAULT 0,
  shipping_amount_minor bigint,
  placed_at             timestamptz NOT NULL,
  region                region_t NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, source, external_order_id)
);
CREATE INDEX IF NOT EXISTS ix_orders_placed   ON commerce.orders(brand_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS ix_orders_customer ON commerce.orders(brand_id, customer_id);
CREATE INDEX IF NOT EXISTS ix_orders_revstate ON commerce.orders(brand_id, revenue_state);
CREATE INDEX IF NOT EXISTS bx_orders_placed   ON commerce.orders USING brin(placed_at);
SELECT brain_apply_updated_at('commerce.orders');
SELECT brain_apply_brand_rls('commerce.orders');
SELECT brain_meta.register('commerce','orders',1,'commerce','aurora');

CREATE TABLE IF NOT EXISTS commerce.order_items (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id        uuid NOT NULL,
  order_id        uuid NOT NULL REFERENCES commerce.orders(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES commerce.products(id) ON DELETE RESTRICT,
  variant_id      uuid REFERENCES commerce.variants(id),
  sku             text NOT NULL,
  quantity        integer NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL,                                     -- tax-inclusive unit price at sale
  tax_rate        numeric(5,2) NOT NULL,                                -- SKU slab RATE (stays fractional, not money)
  unit_cogs_minor bigint,                                              -- landed unit cost; estimate-flagged if NULL
  line_no         integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, line_no)
);
CREATE INDEX IF NOT EXISTS ix_items_order   ON commerce.order_items(brand_id, order_id);
CREATE INDEX IF NOT EXISTS ix_items_product ON commerce.order_items(brand_id, product_id);
SELECT brain_apply_updated_at('commerce.order_items');
SELECT brain_apply_brand_rls('commerce.order_items');
SELECT brain_meta.register('commerce','order_items',1,'commerce','aurora');

CREATE TABLE IF NOT EXISTS commerce.inventory (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id    uuid NOT NULL,
  variant_id  uuid NOT NULL REFERENCES commerce.variants(id),
  location_id text NOT NULL,
  on_hand     integer NOT NULL CHECK (on_hand >= 0),
  reserved    integer NOT NULL DEFAULT 0,
  days_cover  numeric(8,2),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, variant_id, location_id)
);
SELECT brain_apply_updated_at('commerce.inventory');
SELECT brain_apply_brand_rls('commerce.inventory');
SELECT brain_meta.register('commerce','inventory',1,'inventory','aurora');

CREATE TABLE IF NOT EXISTS commerce.pricing (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id      uuid NOT NULL,
  variant_id    uuid NOT NULL REFERENCES commerce.variants(id),
  price_minor   bigint NOT NULL,
  currency_code char(3) NOT NULL REFERENCES reference.currencies(code),
  valid_from    timestamptz NOT NULL,
  valid_to      timestamptz,                                            -- NULL = current (SCD2)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pricing_variant ON commerce.pricing(brand_id, variant_id, valid_from DESC);
SELECT brain_apply_updated_at('commerce.pricing');
SELECT brain_apply_brand_rls('commerce.pricing');
SELECT brain_meta.register('commerce','pricing',1,'commerce','aurora');

CREATE TABLE IF NOT EXISTS commerce.discounts (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id    uuid NOT NULL,
  code        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('percent','fixed','bundle','gift')),
  value_minor bigint,                                                   -- fixed value; NULL for percent
  percent_bps integer,                                                  -- basis points; NULL for fixed
  eligibility jsonb,
  valid_from  timestamptz,
  valid_to    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, code)
);
SELECT brain_apply_updated_at('commerce.discounts');
SELECT brain_apply_brand_rls('commerce.discounts');
SELECT brain_meta.register('commerce','discounts',1,'commerce','aurora');

-- cost_config — drives honest contribution margin. Reports flagged "estimated" until coverage ≥ top-80% of revenue.
CREATE TABLE IF NOT EXISTS commerce.cost_config (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id    uuid NOT NULL,
  scope       text NOT NULL CHECK (scope IN ('sku','category','order','brand')),
  scope_ref   text,
  key         text NOT NULL,                                            -- cogs|packaging|fwd_shipping|ret_shipping|cod_fee|gateway_fee|marketplace_fee|refund_provision|fixed_monthly|founder_salary|warehouse
  value_minor bigint,                                                   -- absolute cost (minor units)
  rate_bps    integer,                                                  -- percentage cost (basis points)
  rule        jsonb,
  valid_from  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, scope, scope_ref, key, valid_from)
);
CREATE INDEX IF NOT EXISTS ix_cost_config_lookup ON commerce.cost_config(brand_id, scope, key);
SELECT brain_apply_updated_at('commerce.cost_config');
SELECT brain_apply_brand_rls('commerce.cost_config');
SELECT brain_meta.register('commerce','cost_config',1,'commerce','aurora');
