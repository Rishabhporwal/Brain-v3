-- Brain shared enum & domain types (§1.3). Defined once; new values added by additive migration.
-- Idempotent: guarded by pg_type existence checks.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='region_t') THEN
    CREATE TYPE region_t AS ENUM ('IN','AE','SA','BH','OM','QA','KW');               -- ISO-3166 a2; drives residency
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='entity_status_t') THEN
    CREATE TYPE entity_status_t AS ENUM ('provisioning','active','suspended','closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='actor_type_t') THEN
    CREATE TYPE actor_type_t AS ENUM ('brain_agent','user','automation','external_api','system_guardrail');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='risk_level_t') THEN
    CREATE TYPE risk_level_t AS ENUM ('low','medium','high','critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='reversibility_t') THEN
    CREATE TYPE reversibility_t AS ENUM ('reversible','partially_reversible','irreversible');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='approval_state_t') THEN
    CREATE TYPE approval_state_t AS ENUM ('proposed','approved','rejected','edited','auto_executed','blocked','reversed','expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='execution_state_t') THEN
    CREATE TYPE execution_state_t AS ENUM ('not_started','queued','sent','executed','failed','reversed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='channel_t') THEN
    CREATE TYPE channel_t AS ENUM ('whatsapp','email','sms','voice','push','ads','chat','ig_dm');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='consent_purpose_t') THEN
    CREATE TYPE consent_purpose_t AS ENUM ('marketing','utility','authentication','analytics');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='consent_state_t') THEN
    CREATE TYPE consent_state_t AS ENUM ('granted','withdrawn','not_collected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='payment_method_t') THEN
    CREATE TYPE payment_method_t AS ENUM ('cod','prepaid','bnpl');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='revenue_state_t') THEN
    CREATE TYPE revenue_state_t AS ENUM ('placed','confirmed','shipped','delivered','settled','cancelled','returned','refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='attribution_model_t') THEN
    CREATE TYPE attribution_model_t AS ENUM ('first','last','linear','position','data_driven');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='match_type_t') THEN
    CREATE TYPE match_type_t AS ENUM ('deterministic','probabilistic');
  END IF;
  -- currency_t is a text DOMAIN (CHECK), not an enum (§1.3); minor_unit comes from reference.currencies (§1.7).
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='currency_t') THEN
    CREATE DOMAIN currency_t AS char(3) CHECK (VALUE IN ('INR','AED','SAR','BHD','OMR','QAR','KWD','USD'));
  END IF;
END $$;
