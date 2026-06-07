-- §17 connector_catalog seed — Phase-1 connectors (Blueprint §2.13 Tier 1–3). Idempotent.
INSERT INTO reference.connector_catalog(provider,category,tier,quality_default,region_gated) VALUES
  ('shopify',   'storefront', '1', 'green',  false),
  ('meta',      'ads',        '1', 'green',  false),
  ('google',    'ads',        '1', 'green',  false),
  ('stripe',    'payments',   '2', 'green',  false),
  ('razorpay',  'payments',   '2', 'green',  true),
  ('shiprocket','logistics',  '3', 'yellow', true),
  ('whatsapp',  'messaging',  '3', 'yellow', false)
ON CONFLICT (provider) DO UPDATE
  SET category=excluded.category, tier=excluded.tier,
      quality_default=excluded.quality_default, region_gated=excluded.region_gated;
