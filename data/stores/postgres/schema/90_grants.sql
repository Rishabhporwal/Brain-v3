-- ============================================================================
-- §1.5 RLS enforcement role grants. Applied LAST (after all tables exist).
-- brain_app is the NON-superuser role the application SET LOCAL ROLEs into per request so that RLS
-- actually enforces (the connection role is the DB owner, which BYPASSES RLS). It needs table DML on
-- tenant schemas + read on global reference data. See @brain/tenancy withBrandContext + ACCESS_CONTROL.md.
-- ============================================================================

DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'platform','identity','tracking','event_platform','commerce','marketing','integration','shared','consent'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = s) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO brain_app', s);
      EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO brain_app', s);
      -- Future tables created by the schema owner inherit these grants.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO brain_app', s);
    END IF;
  END LOOP;
END $$;

-- Global reference data is read-only to tenants.
GRANT SELECT ON ALL TABLES IN SCHEMA reference TO brain_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA reference GRANT SELECT ON TABLES TO brain_app;

-- audit_logs is append-only — the app role may read + insert, never update/delete.
REVOKE UPDATE, DELETE ON platform.audit_logs FROM brain_app;
