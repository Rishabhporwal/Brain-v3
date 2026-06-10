-- ============================================================================
-- §4 TRACKING (Aurora keys/config) + §19 EVENT PLATFORM (Aurora substrate). Phase 1.
-- High-volume event bodies live in ClickHouse/Iceberg (see warehouse/clickhouse/) — only
-- keys, the schema-registry mirror, processing checkpoints/offsets and the DLQ index are Aurora.
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS tracking;
CREATE SCHEMA IF NOT EXISTS event_platform;
GRANT USAGE ON SCHEMA tracking, event_platform TO brain_app;

-- §4 tracking_keys — public ingest write-key issued to the SDK.
CREATE TABLE IF NOT EXISTS tracking.tracking_keys (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id    uuid NOT NULL,                                            -- logical FK→platform.brands.id, RLS
  write_key   text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tracking_keys_brand ON tracking.tracking_keys(brand_id);
SELECT brain_apply_updated_at('tracking.tracking_keys');
SELECT brain_apply_brand_rls('tracking.tracking_keys');
SELECT brain_meta.register('tracking','tracking_keys',1,'tracking','aurora');

-- §19.1 event_metadata — catalog of event semantics (routing/retention/erasure). brand_id NULL = platform-global.
CREATE TABLE IF NOT EXISTS event_platform.event_metadata (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id       uuid,                                                  -- NULL = platform-global type
  canonical_type text NOT NULL UNIQUE,
  domain         text NOT NULL,
  description    text NOT NULL,
  pii_class      text NOT NULL CHECK (pii_class IN ('none','pseudonymous','pii')),
  is_state_change boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
SELECT brain_apply_updated_at('event_platform.event_metadata');
ALTER TABLE event_platform.event_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_platform.event_metadata FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON event_platform.event_metadata;
CREATE POLICY brand_isolation ON event_platform.event_metadata
  USING      (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid)
  WITH CHECK (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid);
SELECT brain_meta.register('event_platform','event_metadata',1,'tracking','aurora');

-- §19.1 event_schema_versions — GLOBAL reference; mirrors the Kafka Schema Registry. No brand_id, no RLS.
CREATE TABLE IF NOT EXISTS event_platform.event_schema_versions (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  subject        text NOT NULL,
  version        integer NOT NULL,
  schema_def     jsonb NOT NULL,
  compatibility  text NOT NULL CHECK (compatibility IN ('backward','forward','full')),
  status         text NOT NULL CHECK (status IN ('active','deprecated')),
  effective_from timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject, version)
);
SELECT brain_meta.register('event_platform','event_schema_versions',1,'schema-registry','aurora');

-- §19.2 event_processing_checkpoint — Flink exactly-once recovery. Global (no brand_id).
CREATE TABLE IF NOT EXISTS event_platform.event_processing_checkpoint (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  pipeline           text NOT NULL,
  operator           text NOT NULL,
  checkpoint_id      bigint NOT NULL,
  state_snapshot_ref text NOT NULL,                                     -- S3 reference
  committed_at       timestamptz NOT NULL,
  UNIQUE (pipeline, operator)
);
SELECT brain_meta.register('event_platform','event_processing_checkpoint',1,'event-processing','aurora');

-- §19.2 event_offsets — queryable consumer progress per topic-partition. Global (no brand_id).
CREATE TABLE IF NOT EXISTS event_platform.event_offsets (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  consumer_group   text NOT NULL,
  topic            text NOT NULL,
  partition        integer NOT NULL,
  committed_offset bigint NOT NULL,
  committed_at     timestamptz NOT NULL,
  UNIQUE (consumer_group, topic, partition)
);
SELECT brain_meta.register('event_platform','event_offsets',1,'event-ingestion','aurora');

-- §19.3 event_dead_letter_queue — Aurora index of the DLQ (bodies in ClickHouse). Operator-visible, replayable.
CREATE TABLE IF NOT EXISTS event_platform.event_dead_letter_queue (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id    uuid,                                                     -- NULL if not parseable
  event_id    uuid,
  pipeline    text NOT NULL,
  error_class text NOT NULL,                                            -- schema_violation|missing_identifier|consent_absent|parse_error|downstream_error
  raw_payload text NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','replayed','discarded')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dlq_brand_status ON event_platform.event_dead_letter_queue(brand_id, status);
CREATE INDEX IF NOT EXISTS ix_dlq_pipeline_err ON event_platform.event_dead_letter_queue(pipeline, error_class);
SELECT brain_apply_updated_at('event_platform.event_dead_letter_queue');
ALTER TABLE event_platform.event_dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_platform.event_dead_letter_queue FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON event_platform.event_dead_letter_queue;
CREATE POLICY brand_isolation ON event_platform.event_dead_letter_queue
  USING      (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid)
  WITH CHECK (brand_id IS NULL OR brand_id = NULLIF(current_setting('app.current_brand', true), '')::uuid);
SELECT brain_meta.register('event_platform','event_dead_letter_queue',1,'event-ingestion','aurora');
