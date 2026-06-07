-- ============================================================================
-- §16/§20 DECISION LOG + RECOMMENDATION LIFECYCLE (foundation). Owner: Decision-Log & Memory. Phase 2.
-- decision_log is the Aurora HOT INDEX of the append-only, immutable Iceberg system-of-record. The
-- normalized condition→recommendation→evidence tables make each stage independently queryable.
-- Human-action/execution tables + Brand Fingerprint are Phase 5 (excluded here). THE MOAT.
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS decision;
GRANT USAGE ON SCHEMA decision TO brain_app;

-- decision_log — hot index; outcomes appended (Iceberg SoR is never mutated). No official action exists unless logged.
CREATE TABLE IF NOT EXISTS decision.decision_log (
  decision_id        uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id           uuid NOT NULL,
  actor_type         actor_type_t NOT NULL,
  actor_id           text NOT NULL,
  domain             text NOT NULL CHECK (domain IN ('marketing','lifecycle','support','logistics','inventory','finance','product','pricing','attribution','compliance')),
  trigger            text NOT NULL CHECK (trigger IN ('anomaly','schedule','user_query','ticket','campaign_event','stock_event','integration_event','manual_log')),
  condition_snapshot jsonb NOT NULL,
  recommendation     text NOT NULL,
  action_payload     jsonb,
  expected_impact    jsonb NOT NULL,
  confidence         numeric(5,4) NOT NULL,
  risk_level         risk_level_t NOT NULL,
  reversibility      reversibility_t NOT NULL,
  approval_state     approval_state_t NOT NULL,
  execution_state    execution_state_t NOT NULL,
  channel_provider   text,
  cost_minor         bigint,
  revenue_attributed jsonb,
  outcome_7d         jsonb,
  outcome_30d        jsonb,
  learning_note      text,
  lineage_handle     text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dlog_created  ON decision.decision_log(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_dlog_domain   ON decision.decision_log(brand_id, domain);
CREATE INDEX IF NOT EXISTS ix_dlog_approval ON decision.decision_log(brand_id, approval_state);
CREATE INDEX IF NOT EXISTS ix_dlog_exec     ON decision.decision_log(brand_id, execution_state);
CREATE INDEX IF NOT EXISTS bx_dlog_created  ON decision.decision_log USING brin(created_at);
SELECT brain_apply_brand_rls('decision.decision_log');
SELECT brain_meta.register('decision','decision_log',2,'decision-log','aurora');

-- decision_conditions — what was true at detection (links to a decision once a rec is made).
CREATE TABLE IF NOT EXISTS decision.decision_conditions (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id           uuid NOT NULL,
  decision_id        uuid REFERENCES decision.decision_log(decision_id),
  trigger            text NOT NULL CHECK (trigger IN ('anomaly','schedule','user_query','ticket','campaign_event','stock_event','integration_event','manual_log')),
  condition_snapshot jsonb NOT NULL,
  lineage_handle     text NOT NULL,
  detected_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cond_decision ON decision.decision_conditions(brand_id, decision_id);
CREATE INDEX IF NOT EXISTS ix_cond_trigger  ON decision.decision_conditions(brand_id, trigger);
SELECT brain_apply_brand_rls('decision.decision_conditions');
SELECT brain_meta.register('decision','decision_conditions',2,'decision-log','aurora');

-- recommendations — ranked primarily by expected CM2 impact; carries agent+rec version for reproducibility.
CREATE TABLE IF NOT EXISTS decision.recommendations (
  id                        uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id                  uuid NOT NULL,
  decision_id               uuid REFERENCES decision.decision_log(decision_id),
  condition_id              uuid NOT NULL REFERENCES decision.decision_conditions(id),
  agent                     text NOT NULL,
  agent_version             text NOT NULL,
  recommendation_version    integer NOT NULL DEFAULT 1,
  action_title              text NOT NULL,
  expected_revenue_minor    bigint,
  expected_cm2_impact_minor bigint,
  confidence_score          numeric(5,4) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  risk_score                numeric(5,4) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1),
  risk_level                risk_level_t NOT NULL,
  reversibility             reversibility_t NOT NULL,
  approval_level            text NOT NULL,
  status                    approval_state_t NOT NULL DEFAULT 'proposed',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_rec_status ON decision.recommendations(brand_id, status);
CREATE INDEX IF NOT EXISTS ix_rec_agent  ON decision.recommendations(brand_id, agent, agent_version);
CREATE INDEX IF NOT EXISTS ix_rec_cm2    ON decision.recommendations(brand_id, expected_cm2_impact_minor DESC);
SELECT brain_apply_updated_at('decision.recommendations');
SELECT brain_apply_brand_rls('decision.recommendations');
SELECT brain_meta.register('decision','recommendations',2,'agent','aurora');

-- recommendation_evidence — every rec's evidence is explicitly the metric-engine figures it used.
CREATE TABLE IF NOT EXISTS decision.recommendation_evidence (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id          uuid NOT NULL,
  recommendation_id uuid NOT NULL REFERENCES decision.recommendations(id) ON DELETE CASCADE,
  metric_key        text NOT NULL,                              -- logical ref metrics.metric_registry.metric_key
  metric_version    integer NOT NULL,
  value_minor       bigint,
  value_numeric     numeric(38,12),
  lineage_handle    text NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_rec_evidence ON decision.recommendation_evidence(brand_id, recommendation_id);
SELECT brain_apply_brand_rls('decision.recommendation_evidence');
SELECT brain_meta.register('decision','recommendation_evidence',2,'agent','aurora');

-- recommendation_versions — APPEND-ONLY; edits append a new version, history immutable.
CREATE TABLE IF NOT EXISTS decision.recommendation_versions (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id          uuid NOT NULL,
  recommendation_id uuid NOT NULL REFERENCES decision.recommendations(id),
  version           integer NOT NULL,
  snapshot          jsonb NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recommendation_id, version)
);
SELECT brain_apply_brand_rls('decision.recommendation_versions');
SELECT brain_meta.register('decision','recommendation_versions',2,'decision-log','aurora');
