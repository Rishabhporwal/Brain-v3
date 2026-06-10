# Commerce Intelligence — the metric engine is the only number source (Commerce pod). Phase 2.

No services are live yet. The full landscape — `metric-engine` (Tier-0),
`realized-revenue-ledger`, `attribution`, `analytics`, `dashboard-serving`,
`read-model-builder`, `decision-log`, `journey-builder`, `incrementality`, `mmm`,
`executive-analytics`, and `domain-services/*` (finance-cash, logistics-rto, inventory,
forecasting, procurement, vendor, lifecycle) — lives as manifests in
[`tools/service-catalog/commerce-intelligence/`](../tools/service-catalog/commerce-intelligence/).

Invariant (Architecture v2, Appendix): **only `metric-engine` may produce a business
figure.** Until it ships, any surface reading numbers directly (e.g. the BFF reading
ClickHouse) is a tracked interim exception, not the pattern.
