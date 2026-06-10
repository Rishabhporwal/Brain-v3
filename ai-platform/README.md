# AI / ML Platform (Python) — Feast/MLflow/LangGraph/BentoML (AI pod). Phase 4+.

Advisory; subordinate to the deterministic core — AI narrates computed figures, never
invents them.

No services are live yet. The landscape lives as manifests in
[`tools/service-catalog/ai-platform/`](../tools/service-catalog/ai-platform/):

- `services/*` — feature-engineering, feature-store, model-training, model-registry,
  model-serving, model-monitoring, evaluation
- `agents/*` — `_base` + marketing/operations/finance/planning discipline runtimes
- `llm-gateway` — the ONLY egress to model providers (cost routing, redaction, caching)
- model families (rto-prediction, ltv, churn, demand-forecasting, creative-fatigue,
  data-driven-attribution, budget-optimization) — Solution Architecture §4.5

When the first Python service is scaffolded, re-enable its glob in the root
`pyproject.toml` `[tool.uv.workspace]` members.
