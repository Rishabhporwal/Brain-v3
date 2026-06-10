# Service Catalog — the target-state landscape as data, not folders

This catalog is the single machine-readable registry of every planned Brain service.
Each `<platform>/<service>.yaml` is the service's manifest (owner pod, phase, language,
SLOs, contracts, `path:` where it will live on disk). It feeds the CI deploy matrix,
on-call routing, and the scaffolder.

**The rule:** a directory exists in the repo only when a service is actually being
built. Until then the service lives here as a manifest. This replaces the old
"create every Phase 0–5 folder up front" approach (~80 empty skeletons) that made
the repo unreadable.

## Starting work on a cataloged service (golden path)

1. Find its manifest here; its `path:` field is the canonical location.
2. Add/extend its contracts in `/contracts` first (events, proto, openapi).
3. Scaffold from the template: `tools/generators` (NestJS) or the Python generator,
   targeting the manifest's `path:`.
4. Add the package to `pnpm-workspace.yaml` (TS) or `pyproject.toml` `[tool.uv.workspace]`
   members (Python).
5. Move the manifest from the catalog into the service directory as its `service.yaml`
   (the live directory replaces the catalog entry).

## Layout

Mirrors the repo's platform top level:

```
service-catalog/
├── platform/                 # Platform Foundation services (auth, brand, rbac, …)
├── data-platform/            # first-party-data/*, aggregation-zone, skeleton connectors
├── commerce-intelligence/    # metric-engine, realized-revenue-ledger, domain-services/*, …
├── customer-intelligence/    # customer-profile, customer-360, consent, audiences, …
├── agent-platform/           # orchestrator, guardrail, approval, execution, reversal, …
└── ai-platform/              # services/* (ML lifecycle), agents/* (discipline runtimes), llm-gateway
```

Phases and naming follow `docs/Brain_Solution_Architecture.docx` (source of truth).
