# Commerce Intelligence — the metric engine is the only number source (Commerce pod)

**Live:**
- `realized-revenue-ledger/` — the financial golden record: realization state machine
  (placed → delivered/cancelled/refunded/rto) + slow-tail reconciliation over the ~45-day
  window into `brain.revenue_ledger`; corrections are new versions, never mutations.
- `metric-engine/` — the Tier-0 deterministic engine. Formula book:
`contracts/metrics/registry.yaml` (version-locked; drift refuses to boot). Consumed via
`@brain/metric-client` (the BFF read-model quotes it when `METRIC_ENGINE_URL` is set;
its inline computation remains only as the no-engine fallback).

**Planned** — `attribution`, `analytics`, `dashboard-serving`,
`read-model-builder`, `decision-log`, `journey-builder`, `incrementality`, `mmm`,
`executive-analytics`, and `domain-services/*` (finance-cash, logistics-rto, inventory,
forecasting, procurement, vendor, lifecycle) — manifests in
[`tools/service-catalog/commerce-intelligence/`](../tools/service-catalog/commerce-intelligence/).

Invariant (Architecture v2, Appendix): **only `metric-engine` may produce a business
figure.** Values carry `formula_version` and an `estimated` flag (fallback evidence
paths); surfaces must label estimated values.
