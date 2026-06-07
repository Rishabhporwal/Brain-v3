-- ============================================================================
-- §13 GOALS (RAG targets) + §19 EVENT REPLAY (controlled rebuild of derived stores). Phase 2.
-- ============================================================================
SET client_min_messages = warning;

-- §13 goals — targets/thresholds per metric; power RAG status. (goals.metric is a logical ref to the registry.)
CREATE TABLE IF NOT EXISTS commerce.goals (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id   uuid NOT NULL,
  metric     text NOT NULL,                                     -- logical ref metrics.metric_registry.metric_key
  period     text NOT NULL CHECK (period IN ('daily','weekly','monthly','event')),
  type       text NOT NULL CHECK (type IN ('min','max','target','range')),
  threshold  jsonb NOT NULL,                                    -- threshold(s); RAG per BRD §9.7
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_goals_lookup ON commerce.goals(brand_id, metric, period);
SELECT brain_apply_updated_at('commerce.goals');
SELECT brain_apply_brand_rls('commerce.goals');
SELECT brain_meta.register('commerce','goals',2,'commerce','aurora');

-- §19 event_replay_requests — controlled, auditable rebuild from the immutable log. brand_id NULL = all-brand (system).
CREATE TABLE IF NOT EXISTS event_platform.event_replay_requests (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id      uuid,
  target_store  text NOT NULL CHECK (target_store IN ('clickhouse','opensearch','read_models','attribution','all')),
  from_event_ts timestamptz NOT NULL,
  to_event_ts   timestamptz,                                    -- NULL = now
  source        text NOT NULL CHECK (source IN ('iceberg','kafka')),
  requested_by  text NOT NULL,
  status        text NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_replay_req_status ON event_platform.event_replay_requests(brand_id, status);
SELECT brain_apply_updated_at('event_platform.event_replay_requests');
ALTER TABLE event_platform.event_replay_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_platform.event_replay_requests FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON event_platform.event_replay_requests;
CREATE POLICY brand_isolation ON event_platform.event_replay_requests
  USING      (brand_id IS NULL OR brand_id = current_setting('app.current_brand', true)::uuid)
  WITH CHECK (brand_id IS NULL OR brand_id = current_setting('app.current_brand', true)::uuid);
SELECT brain_meta.register('event_platform','event_replay_requests',2,'data-platform','aurora');

-- §19 event_replay_history — APPEND-ONLY; every rebuild pinned to its Iceberg snapshot (reproducible).
CREATE TABLE IF NOT EXISTS event_platform.event_replay_history (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  request_id         uuid NOT NULL REFERENCES event_platform.event_replay_requests(id),
  brand_id           uuid,
  events_replayed    bigint NOT NULL,
  iceberg_snapshot_id text,
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  result             text
);
CREATE INDEX IF NOT EXISTS ix_replay_hist_req ON event_platform.event_replay_history(request_id);
ALTER TABLE event_platform.event_replay_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_platform.event_replay_history FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON event_platform.event_replay_history;
CREATE POLICY brand_isolation ON event_platform.event_replay_history
  USING      (brand_id IS NULL OR brand_id = current_setting('app.current_brand', true)::uuid)
  WITH CHECK (brand_id IS NULL OR brand_id = current_setting('app.current_brand', true)::uuid);
SELECT brain_meta.register('event_platform','event_replay_history',2,'data-platform','aurora');
