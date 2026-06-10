-- ============================================================================
-- Billing (BRD §23) — tier assignment + activation override. The fee math lives in
-- platform/billing (DEFAULT_TIERS encodes the §23.2 indicative packaging); this table
-- only OVERRIDES the default 'launch' tier / Day-0–14 activation window per brand.
-- Money-moving surface: schema changes require Security co-sign (CODEOWNERS).
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE IF NOT EXISTS billing.brand_tier (
  brand_id            UUID PRIMARY KEY REFERENCES platform.brands(id) ON DELETE CASCADE,
  tier                TEXT NOT NULL CHECK (tier IN ('launch','growth','scale','enterprise')),
  activation_ends_at  TIMESTAMPTZ,          -- NULL = default Day-0–14 from brand creation
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE billing.brand_tier IS
  'Per-brand pricing tier override (default: launch). Fee formula + indicative percentages: platform/billing/src/domain/fee.ts (BRD §23.2).';
