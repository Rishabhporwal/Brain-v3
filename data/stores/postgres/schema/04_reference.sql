-- Global reference tables (§1.6): no brand_id, no RLS, read-only to tenants. Seed in seed/00_reference_seed.sql.
CREATE SCHEMA IF NOT EXISTS reference;

-- currencies — drives the monetary minor-unit scale (§1.7). minor_unit is DATA, never a hardcoded ×100.
CREATE TABLE IF NOT EXISTS reference.currencies (
  code        char(3) PRIMARY KEY CHECK (code IN ('INR','AED','SAR','BHD','OMR','QAR','KWD','USD')),
  name        text    NOT NULL,
  minor_unit  int     NOT NULL CHECK (minor_unit BETWEEN 0 AND 4)   -- exponent: 2 for INR/AED, 3 for BHD/OMR/KWD
);
SELECT brain_meta.register('reference','currencies',1,'region-adapter','aurora');

-- regions — residency + default currency per ISO-3166 region (§30.2).
CREATE TABLE IF NOT EXISTS reference.regions (
  code           region_t PRIMARY KEY,
  name           text     NOT NULL,
  currency       currency_t NOT NULL REFERENCES reference.currencies(code),
  residency_zone text     NOT NULL CHECK (residency_zone IN ('india','gcc'))
);
SELECT brain_meta.register('reference','regions',1,'region-adapter','aurora');

-- tax_slabs — per-region GST/VAT slabs (§30.3). Rate is a dimensionless ratio, not money.
CREATE TABLE IF NOT EXISTS reference.tax_slabs (
  region   region_t      NOT NULL REFERENCES reference.regions(code),
  slab     text          NOT NULL,
  rate_pct numeric(6,3)  NOT NULL CHECK (rate_pct >= 0),
  label    text          NOT NULL,
  PRIMARY KEY (region, slab)
);
SELECT brain_meta.register('reference','tax_slabs',1,'region-adapter','aurora');
