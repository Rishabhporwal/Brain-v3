-- Phase-2 Formula Book seed — core metrics + formulas + versions + the metric DAG. Idempotent.
INSERT INTO metrics.formula_registry(formula_key, expression_lang, description) VALUES
  ('cm1','engine_dsl','Net revenue (net of tax) minus COGS'),
  ('cm2','engine_dsl','CM1 minus variable costs and marketing'),
  ('cm3','engine_dsl','CM2 minus fixed/operating costs'),
  ('true_cm2','engine_dsl','CM2 after RTO, refund and payment provisions'),
  ('mer','engine_dsl','Realized revenue divided by total ad spend'),
  ('cac','engine_dsl','Acquisition spend divided by new customers'),
  ('rto_rate','engine_dsl','RTO shipments divided by total shipments')
ON CONFLICT (formula_key) DO NOTHING;

INSERT INTO metrics.formula_versions(formula_id, version, expression)
SELECT id, 1, 'v1::'||formula_key FROM metrics.formula_registry
ON CONFLICT (formula_id, version) DO NOTHING;

INSERT INTO metrics.metric_registry(metric_key, display_name, grain, unit_kind, description, is_billing_grade) VALUES
  ('cm1','CM1','order','money','Contribution margin 1',true),
  ('cm2','CM2','order','money','Contribution margin 2',true),
  ('cm3','CM3','order','money','Contribution margin 3',false),
  ('true_cm2','True CM2','order','money','CM2 after RTO/refund/payment provisions',true),
  ('mer','MER','workspace','ratio','Marketing efficiency ratio',false),
  ('cac','CAC','channel','money','Customer acquisition cost',false),
  ('rto_rate','RTO Rate','workspace','ratio','Return-to-origin rate',false)
ON CONFLICT (metric_key) DO NOTHING;

-- link each metric to its formula's v1
INSERT INTO metrics.metric_versions(metric_id, version, formula_version_id)
SELECT mr.id, 1, fv.id
FROM metrics.metric_registry mr
JOIN metrics.formula_registry fr ON fr.formula_key = mr.metric_key
JOIN metrics.formula_versions fv ON fv.formula_id = fr.id AND fv.version = 1
ON CONFLICT (metric_id, version) DO NOTHING;

-- the metric DAG: cm2←cm1, cm3←cm2, true_cm2←cm2
INSERT INTO metrics.metric_dependencies(metric_id, depends_on_metric_id)
SELECT a.id, b.id
FROM metrics.metric_registry a
JOIN metrics.metric_registry b ON (a.metric_key, b.metric_key) IN (('cm2','cm1'), ('cm3','cm2'), ('true_cm2','cm2'))
ON CONFLICT (metric_id, depends_on_metric_id) DO NOTHING;
