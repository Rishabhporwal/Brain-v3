-- Brain shared functions: UUID v7 (§1.1), updated_at trigger, and the standard RLS applicator (§1.5).

-- UUID v7 (time-ordered). Services normally generate v7 themselves; this is the DB-side default
-- for seed rows and convenience. Pure core SQL (no extension beyond pgcrypto's gen_random_uuid).
CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid
LANGUAGE plpgsql VOLATILE PARALLEL SAFE AS $$
DECLARE
  ts_ms bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  b     bytea  := uuid_send(gen_random_uuid());
BEGIN
  b := overlay(b placing substring(int8send(ts_ms) from 3 for 6) from 1 for 6);  -- 48-bit ms timestamp
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);                              -- version = 7 (0111)
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);                              -- variant = 10
  RETURN encode(b, 'hex')::uuid;
END $$;

-- updated_at maintenance (§1.1: maintained by trigger; equals created_at on insert).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION brain_apply_updated_at(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %s', tbl);
  EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %s
                  FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl);
END $$;

-- Standard brand-isolation RLS (§1.5). The data-access guard sets app.current_brand per request;
-- this policy is the database-level backstop. current_setting(...,true) → NULL when unset = fail closed.
CREATE OR REPLACE FUNCTION brain_apply_brand_rls(tbl regclass, brand_col text DEFAULT 'brand_id') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS brand_isolation ON %s', tbl);
  -- NULLIF(...,'') so an UNSET or empty app.current_brand → NULL → matches no row (fail closed),
  -- instead of erroring on ''::uuid. A reused pooled connection reads a reset custom GUC as ''.
  EXECUTE format($p$CREATE POLICY brand_isolation ON %s
      USING      (%I = NULLIF(current_setting('app.current_brand', true), '')::uuid)
      WITH CHECK (%I = NULLIF(current_setting('app.current_brand', true), '')::uuid)$p$,
    tbl, brand_col, brand_col);
END $$;

-- Application role RLS applies to (superuser/owner bypass unless FORCE; FORCE is set above).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='brain_app') THEN
    CREATE ROLE brain_app NOLOGIN;
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS reference;
GRANT USAGE ON SCHEMA reference, brain_meta TO brain_app;
