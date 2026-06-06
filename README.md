# Brain

The AI-native commerce operating system for DTC brands in India, UAE, and GCC.

This is the **Brain primary monorepo** — a hybrid monorepo (Turborepo + pnpm for TypeScript, uv for Python) organized by **platform / bounded-context boundaries**, not by language or tier. It carries the platform from **Phase 1 → Phase 6 with no structural reorganization**.

- **Platform map:** [PLATFORM.md](PLATFORM.md)
- **Full structure design (24 sections):** [docs/Brain_Repository_Architecture.md](docs/Brain_Repository_Architecture.md)
- **Source of truth:** [docs/](docs/) — BRD v1.0, Solution Architecture v1.0, Implementation Blueprint (Platform-First) v2.0

## Layout

```
apps/                   Product applications (Next.js web + RN/Expo mobile)
platform-foundation/    Tenancy · identity · governance (NestJS)
first-party-data/       Tracking · events · identity resolution
connector-platform/     Connector registry + per-provider connectors
commerce-intelligence/  Metric engine (only number source) · ledger · attribution · Decision Log
customer-intelligence/  Customer 360 · segments · audiences (CDP)
agent-platform/         Orchestration (LangGraph) + guardrail/execution (Temporal)
ai-platform/            Models + agent runtimes (Python; advisory)
shared-platform/        region-adapter · llm-gateway · search · aggregation-zone
data-platform/          Kafka · Flink · Spark · ClickHouse · Iceberg assets
contracts/              Single source of truth (proto/avro/openapi/temporal/metrics)
libs/  py-libs/         Shared TypeScript + Python libraries
sdks/                   First-party tracking SDKs
infrastructure/         Terraform · EKS · ArgoCD · observability
deploy/  config/        Local Docker stack + environment overlays
docs/  tools/           Documentation + dev tooling / generators
```

## Getting started

```bash
pnpm install                 # TS workspace
uv sync                      # Python workspace
make -C deploy/local up      # start the whole platform locally (one command)
pnpm affected:build          # build only what changed (Turborepo affected graph)
```

## Conventions

- **One service = one bounded context** = one deployable = one Helm chart = one ArgoCD app = one owning pod (`CODEOWNERS`).
- Internal layout is **DDD / Hexagonal**, by bounded context — never `controllers/`/`services/`/`models/`. See architecture doc §20 (NestJS) / §21 (Python).
- **Only the metric engine produces business numbers**; every other service quotes it via `@brain/metric-client` / `brain-metrics`.
- **Workspace-key tenant isolation** (`@brain/tenancy`) is a mandatory dependency of every service; isolation tests gate every release.
- All schemas live in `contracts/` and are code-generated to **both** TS and Python — `buf breaking` + parity tests gate merges.
- Regenerate the entire tree from the design with `pnpm scaffold` (idempotent).
