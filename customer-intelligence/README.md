# Customer Intelligence (CDP) — the customer as an entity (CDP + Growth pods). Phase 3.

**Live:** `consent/` — append-only consent history (PG `consent.*` schema) + the fail-closed
check (`/consent/check`) every outbound send and capture decision calls; no record = denied
for marketing (DPDP/DLT posture).

**Planned** — `customer-profile`, `customer-360`,
`audience`, `audience-activation`, `segmentation`, `journey-analytics`, `customer-health`,
`search`, `support-inbox` — lives as manifests in
[`tools/service-catalog/customer-intelligence/`](../tools/service-catalog/customer-intelligence/).

Boundary: CDP owns the customer entity; identity comes from
`data-platform/first-party-data/identity-resolution`; money belongs to Commerce.
