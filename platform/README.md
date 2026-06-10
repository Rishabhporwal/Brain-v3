# Platform Foundation — tenancy, identity, governance (Platform-Core pod). Phase 1.

**Live:** `api-gateway-bff/` — the single sync edge (Keycloak JWT verification, console
read-model, webhook/OAuth/ingestion lanes, approved-action APIs). It will also host the
customer-facing **MCP server** (P1 — per-brand warehouse access, same auth/tenancy chain;
see `tools/service-catalog/platform/mcp-server.yaml`).

**Planned services** (auth, billing, brand, membership, organization, onboarding, rbac, audit,
governance, configuration, notification, region-adapter, search-svc) live as manifests in
[`tools/service-catalog/platform/`](../tools/service-catalog/platform/) and are scaffolded
on demand when their phase begins. See the catalog README for the golden path.
