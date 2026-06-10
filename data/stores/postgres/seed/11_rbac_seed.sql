-- §30.4 RBAC role→permission map. Idempotent. DERIVED from the code-canonical map in
-- @brain/authz (shared/ts/authz/src/roles.ts ROLE_PERMISSIONS); keep the two in sync.
-- Enforcement reads the code map at runtime; this table mirrors it for audit/query and future services.

-- Owner (org): every permission.
INSERT INTO platform.role_permissions(role_id, permission_id)
SELECT r.id, p.id
  FROM platform.roles r CROSS JOIN platform.permissions p
 WHERE r.scope = 'org' AND r.name = 'Owner'
ON CONFLICT DO NOTHING;

-- Brand-scoped roles: explicit pairs (must mirror ROLE_PERMISSIONS exactly).
INSERT INTO platform.role_permissions(role_id, permission_id)
SELECT r.id, p.id
  FROM (VALUES
    ('Brand Admin','analytics.read'),('Brand Admin','attribution.read'),('Brand Admin','orders.read'),
    ('Brand Admin','ads.read'),('Brand Admin','ads.write'),('Brand Admin','costs.read'),
    ('Brand Admin','costs.write'),('Brand Admin','integrations.read'),('Brand Admin','integrations.write'),
    ('Brand Admin','users.manage'),('Brand Admin','autoexecute.manage'),('Brand Admin','refund.execute'),

    ('Marketing Manager','analytics.read'),('Marketing Manager','attribution.read'),('Marketing Manager','orders.read'),
    ('Marketing Manager','ads.read'),('Marketing Manager','ads.write'),('Marketing Manager','integrations.read'),
    ('Marketing Manager','costs.read'),

    ('Marketing Analyst','analytics.read'),('Marketing Analyst','attribution.read'),('Marketing Analyst','orders.read'),
    ('Marketing Analyst','ads.read'),('Marketing Analyst','costs.read'),

    ('Finance Manager','analytics.read'),('Finance Manager','orders.read'),('Finance Manager','costs.read'),
    ('Finance Manager','costs.write'),('Finance Manager','refund.execute'),

    ('Finance Analyst','analytics.read'),('Finance Analyst','orders.read'),('Finance Analyst','costs.read'),

    ('Operations Manager','analytics.read'),('Operations Manager','orders.read'),
    ('Operations Manager','integrations.read'),('Operations Manager','integrations.write'),

    ('Operations Analyst','analytics.read'),('Operations Analyst','orders.read'),('Operations Analyst','integrations.read'),

    ('Support Manager','analytics.read'),('Support Manager','orders.read'),('Support Manager','refund.execute'),

    ('Support Analyst','analytics.read'),('Support Analyst','orders.read'),

    ('Read Only','analytics.read'),('Read Only','attribution.read'),('Read Only','orders.read')
  ) AS m(role_name, perm_key)
  JOIN platform.roles r       ON r.scope = 'brand' AND r.name = m.role_name
  JOIN platform.permissions p ON p.key = m.perm_key
ON CONFLICT DO NOTHING;
