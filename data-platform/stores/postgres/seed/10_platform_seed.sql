-- §30.4 RBAC role seed (11 roles). Idempotent.
INSERT INTO platform.roles(scope,name,is_system) VALUES
  ('org','Owner',true),
  ('org','Admin',true),
  ('brand','Marketing Manager',true),
  ('brand','Marketing Analyst',true),
  ('brand','Finance Manager',true),
  ('brand','Finance Analyst',true),
  ('brand','Operations Manager',true),
  ('brand','Operations Analyst',true),
  ('brand','Support Manager',true),
  ('brand','Support Analyst',true),
  ('brand','Read Only',true)
ON CONFLICT (scope,name) DO NOTHING;

-- Baseline permission keys (brand/feature/api). Expanded as features land; additive only.
INSERT INTO platform.permissions(key,level) VALUES
  ('analytics.read','feature'),
  ('attribution.read','feature'),
  ('orders.read','feature'),
  ('ads.read','feature'),
  ('ads.write','feature'),
  ('costs.read','feature'),
  ('costs.write','feature'),
  ('integrations.read','feature'),
  ('integrations.write','feature'),
  ('users.manage','feature'),
  ('billing.manage','feature'),
  ('refund.execute','api'),
  ('autoexecute.manage','feature'),
  ('brand.delete','api')
ON CONFLICT (key) DO NOTHING;

-- NOTE: approval_matrix (§30.5) and auto-execute thresholds (§30.6) are Phase-5 (Agent domain) tables.
-- Per the §28.2 leakage guard they are NOT created or seeded in a Phase-1 deployment; their seed ships with Phase 5.
