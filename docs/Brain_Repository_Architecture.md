# Brain — Repository, Workspace & Engineering Organization Architecture

**Status:** Source-of-truth engineering structure
**Derived from:** Brain BRD v1.0 · Brain Solution Architecture v1.0 · Brain Implementation Blueprint (Platform-First) v2.0
**Audience:** Office of the CTO, principal/staff architects, pod leads, EPMs, platform/DevOps
**Scope:** The complete repository, workspace, ownership, folder, contract, deployment, and template design for Brain — built to carry Phase 1 → Phase 6 with **no structural reorganization**.

> This document is opinionated by design. Every choice is traced to an invariant, a phase, a service, or a pod from the three source documents. Brain is **a platform, not a web app** — the structure reflects platform and bounded-context boundaries first, technology second.

---

## 1. Repository Strategy Recommendation

### 1.1 The decision

**Hybrid Monorepo.** One primary monorepo (`brain/`) holds all platform, domain, AI, data, contracts, SDK, and infra code, with a **small, deliberate set of satellite repositories** carved out only where a different release cadence, blast radius, or audience genuinely demands it.

| Repository | Why separate | Owner |
|---|---|---|
| `brain/` (primary monorepo) | All services, apps, AI, data assets, contracts, libs, infra-as-code. Atomic cross-cutting change; one contract source of truth; Turborepo/uv affected-graph builds. | Office of the CTO |
| `brain-gitops` | ArgoCD app-of-apps **desired-state** repo. GitOps best practice keeps *deployment state* out of the *source* repo so an image-tag bump is not a source PR, and prod state has its own RBAC + audit. CI writes here; ArgoCD reads here. | Platform / DevOps (Jatin) |
| `brain-sdk-web` / `brain-sdk-server` / `brain-sdk-mobile` | Public, versioned tracking SDKs shipped to **customers'** sites/apps. Independent semver, public changelog, external security surface, possibly OSS. Mirrored from monorepo `sdks/` source. | Tracking / SDK pod |
| `brain-edge` (optional, P6) | CDN/edge worker for event collection if it must deploy outside the cluster lifecycle. | Data Platform |

Everything else lives in the monorepo. We do **not** spawn a repo per service (that is the polyrepo failure mode for a 100-service platform: contract drift, dependency hell, 100 CI configs, impossible atomic refactors).

### 1.2 Why not the alternatives

| Option | Verdict | Reasoning against (for Brain specifically) |
|---|---|---|
| **Pure Polyrepo** (repo per service) | ✗ Rejected | Brain's #1 invariant is *"only the metric engine produces numbers; every other service quotes it via a shared contract."* That demands a **single contract source of truth** changed atomically with producers and consumers. 100 repos means 100 versioned contract packages drifting — exactly the fragmentation Brain exists to remove. Also: 100 CI/CD configs, cross-service refactors become multi-PR rituals, onboarding a 50–100 eng org is brutal. |
| **Pure Monorepo, no satellites** | ✗ Rejected | GitOps desired-state and public customer SDKs have fundamentally different audiences/cadence/security postures. Forcing prod image-tag bumps and public SDK releases through the source-repo PR flow couples unrelated lifecycles and pollutes source history. |
| **Hybrid Monorepo** | ✓ **Chosen** | Atomic contracts + apps + services + AI + data + infra in one place (matches *"event-driven by default, single definition of every figure, Turborepo affected-graph builds only what changed"* from the Blueprint §11.1). Satellites only where lifecycle truly diverges. Scales to 100+ services and 50–100+ engineers because **boundaries are enforced by CODEOWNERS + project graph, not by repo walls.** |

### 1.3 Build-system & workspace recommendation

| Concern | Recommendation | Why |
|---|---|---|
| **TS monorepo orchestrator** | **Turborepo** + **pnpm** workspaces | The Blueprint already specifies *"Turborepo affected-graph builds only what changed"* (§11.1). Turborepo gives content-hash task caching, `--affected` (which **drives the CI deploy matrix**), and local+remote (S3) cache. Low ceremony — right for a fast-moving 50–100 eng org. |
| **Nx** | ✗ Not chosen | More powerful module-boundary enforcement and generators, but heavier, opinionated, and the docs already chose Turborepo. We replicate Nx's best feature (enforced boundaries) with ESLint boundary rules + CODEOWNERS + `tsconfig` project references. |
| **Bazel** | ⏸ Re-evaluate at Phase 6 | Hermetic, polyglot, best-in-class at thousands-of-targets scale. But the BUILD-file tax and ramp cost are not justified before multi-region/enterprise scale. Revisit only if Turborepo+uv CI times degrade past budget at 100+ services. Structure below is **Bazel-portable** (clean package boundaries) so the migration is mechanical, not structural. |
| **Python workspace** | **uv** workspace + per-service `pyproject.toml` | Fast, lockfile-deterministic, single resolver across all AI services and shared `py-libs/`. Each AI service and agent is its own package; shared code in `py-libs/`. |
| **NestJS workspace strategy** | pnpm workspace; **one deployable Nest app per service** under its platform directory; shared code as **buildable TS libs** in `libs/` consumed via path aliases / project references. **Not** Nest's built-in monorepo `apps/libs` mode (it does not scale to 100 services across platform boundaries). | Each service is independently deployable, owns its data, exposes a versioned contract, autoscales independently (Arch §4.4). |
| **Contract management** | A single `contracts/` package = source of truth: **Protobuf (buf)** for gRPC + MCP-style internal calls, **Avro** for Kafka (Schema Registry), **OpenAPI** for BFF↔client REST, **AsyncAPI** for event topics, **Temporal** workflow/activity interfaces, JSON-Schema for tracking events. Codegen → TS **and** Python so TS↔Python parity is structural. `buf breaking` + contract tests gate merges. | Enforces *"single definition of every figure / contract"* and TS↔Python metric parity. |
| **CI/CD** | **GitHub Actions** (build/test/contract/event/isolation, image build→sign→push **ECR**) → write manifest to **`brain-gitops`** → **ArgoCD** app-of-apps GitOps. Turborepo/uv `--affected` builds the deploy matrix. Trunk-based, PR preview namespaces. | Exactly the Blueprint §11 pipeline. |
| **Team ownership** | **Pod = owner**, expressed as **`CODEOWNERS`** mapping pod → directory. Every service has exactly one owning pod, on-call, SLOs, error budget. No orphaned services. | Blueprint §8.2 leadership model. |

---

## 2. Architecture Principles (that the repo structure encodes)

These are lifted directly from the Solution Architecture's guiding principles and invariants, and each is given a **structural home** so the repo *enforces* them.

| # | Principle (from docs) | How the repository encodes it |
|---|---|---|
| P1 | **Platform, not application** | Top-level directories are the **8 platforms** (Product Apps, Platform Foundation, First-Party Data, Connectors, Commerce Intelligence, Customer Intelligence, Agent, AI) + Data Platform + Infra — never `frontend/`/`backend/`/`by-language`. |
| P2 | **Bounded contexts (DDD)** | Each service is a bounded context: own data, own contract, own tests. Internal layout is DDD/Hexagonal (§20). |
| P3 | **Event-driven by default** | `contracts/events` (Avro/AsyncAPI) + `data-platform/streaming` are first-class top-level citizens, not buried in services. Every state change = an event. |
| P4 | **Deterministic numbers, probabilistic advice** | The **metric engine** is a single service; a contract test asserts **no other service emits a business figure**. AI services produce predictions/scores/text only — structurally separated into `ai-platform/`. |
| P5 | **Structural tenant isolation** | A shared `libs/tenancy` (the workspace-key data-access guard) is a mandatory dependency of every service; `tests/isolation/` is a top-level CI gate. |
| P6 | **Region adapters, never forks** | One `shared-platform/region-adapter` service + `libs/region`. No geography-forked product code anywhere; CI lints for it. |
| P7 | **Realized over placed** | `commerce-intelligence/realized-revenue-ledger` owns the realization tail; reconciliation jobs live in `data-platform/batch`. |
| P8 | **Safe by construction** | `agent-platform/guardrail`, `/execution`, `/reversal`, `/approval` are discrete services every action must traverse. Money-moving path is a separate synchronous, idempotent lane. |
| P9 | **Compounding memory** | `commerce-intelligence/decision-log` + `ai-platform/memory` are permanent, append-only; never co-located with mutable domain data. |
| P10 | **Contract-first / single source of truth** | `contracts/` is the only place schemas are defined; all services consume generated code. `buf breaking` blocks incompatible changes. |
| P11 | **Independently deployable** | One service = one deployable = one Helm chart = one ArgoCD app = one CODEOWNERS pod. |
| P12 | **Two languages only** | TS/NestJS for platform/domain; Python for AI/ML. Enforced by directory: TS never appears under `ai-platform/services`, Python never under `platform-foundation/`. |
| P13 | **Phase-gated, lean-core** | Directories for later-phase services exist from day one but are **empty placeholders with a `PHASE.md`**; the *structure* is stable, the *fill order* follows phases. No reorg between phases. |

---

## 3. Team Ownership Model

Ownership is **pod-based** (Blueprint §8). The repository's top-level boundaries map 1:1 to pods, and `CODEOWNERS` is the machine-enforced contract.

### 3.1 Pods → platform ownership

| Pod | Owns (repository paths) | Phase ramp (from Blueprint §8.1) |
|---|---|---|
| **Platform / Tenancy / Compute Core** | `platform-foundation/`, `commerce-intelligence/metric-engine`, `commerce-intelligence/realized-revenue-ledger`, `commerce-intelligence/read-model-builder`, `agent-platform/guardrail`+`execution`+`decision-log` | 5–6 → 6–8 |
| **Data Platform** | `data-platform/` (streaming, batch, warehouse, lakehouse, contracts), `first-party-data/event-*`, `infrastructure/modules/{msk,clickhouse,s3-iceberg,neo4j}` | 5–6 |
| **Integration** | `connector-platform/` (registry + all connectors), connector write-back | 4–5 |
| **Identity & Customer / CDP** | `first-party-data/identity-resolution`, `customer-intelligence/` (customer-360, profile, consent, audience) | 3–4 → 5–6 (P3) |
| **Tracking / SDK** | `sdks/`, `first-party-data/tracking`, `brain-sdk-*` satellites | 3–4 |
| **Commerce** | `commerce-intelligence/` (attribution, analytics, journey, dashboard-serving), `data-platform/warehouse` models for commerce | from P2 |
| **Growth** | `customer-intelligence/segmentation`+`lifecycle`, `commerce-intelligence/attribution` (creative/budget views), `ai-platform/agents/marketing` | from P2 |
| **Operations** | domain services `logistics-rto`, `inventory`, `support-inbox`, `ai-platform/agents/operations` | from P2 |
| **Finance** | `commerce-intelligence/finance-cash`, `ai-platform/agents/finance` | from P2 |
| **AI Platform** | `ai-platform/` (feature-store, training, registry, serving, evaluation, agents, memory), `shared-platform/llm-gateway` | 8–10 at P4–P5 |
| **Frontend** | `apps/` (all web + mobile + shared UI) | 4–5 |
| **DevOps / SRE** | `infrastructure/`, `deploy/`, `brain-gitops`, `tools/ci`, observability stack | 4–5 → 5–6 |
| **Security** | `contracts/security`, `libs/security`, `libs/auth`, money-moving deploy gates, `docs/security`, isolation test suite | 2–3 → 6–8 |

### 3.2 Governance roles (Blueprint §8.2)

- **Office of the CTO** — owns invariants, phase gates, architecture conformance; chairs phase-exit reviews; root `CODEOWNERS` for `contracts/`, `docs/adr/`, and the invariant test suites.
- **Principal/Staff architects** — embedded per discipline (platform, data, AI); own bounded-context integrity and the contracts in their domain.
- **EPM function** — drives dependencies, phase entry/exit, cross-pod sequencing (lives in `docs/program/`).

### 3.3 `CODEOWNERS` (excerpt)

```gitignore
# Architecture & contracts — CTO + discipline architects must approve
/contracts/                         @brain/office-of-cto @brain/architects
/docs/adr/                          @brain/office-of-cto
/tests/isolation/                   @brain/security @brain/platform-core

# Platforms → pods
/platform-foundation/               @brain/platform-core
/first-party-data/                  @brain/data-platform @brain/tracking-sdk
/connector-platform/                @brain/integration
/commerce-intelligence/             @brain/commerce @brain/platform-core
/customer-intelligence/             @brain/cdp @brain/growth
/agent-platform/                    @brain/platform-core @brain/ai-platform
/ai-platform/                       @brain/ai-platform
/data-platform/                     @brain/data-platform
/shared-platform/region-adapter/    @brain/platform-core
/shared-platform/llm-gateway/       @brain/ai-platform
/apps/                              @brain/frontend
/sdks/                              @brain/tracking-sdk
/infrastructure/                    @brain/devops-sre
/deploy/                            @brain/devops-sre

# Money-moving paths require Security co-sign (Blueprint §11.1)
/agent-platform/guardrail/          @brain/platform-core @brain/security
/agent-platform/execution/          @brain/platform-core @brain/security
```

---

## 4. High-Level Repository Structure

```
brain/                                  # PRIMARY MONOREPO (Turborepo + pnpm + uv)
│
├── apps/                               # ① Product Applications Platform   (Frontend pod)
├── platform-foundation/                # ② Platform Foundation              (Platform-Core pod)
├── first-party-data/                   # ③ First-Party Data Platform        (Data + Tracking pods)
├── connector-platform/                 # ④ Connector Platform               (Integration pod)
├── commerce-intelligence/              # ⑤ Commerce Intelligence Platform   (Commerce + Platform-Core)
├── customer-intelligence/              # ⑥ Customer Intelligence (CDP)      (CDP + Growth pods)
├── agent-platform/                     # ⑦ Agent Platform                   (Platform-Core + AI)
├── ai-platform/                        # ⑧ AI / ML Platform (Python)        (AI Platform pod)
├── shared-platform/                    # cross-cutting platform services    (various)
│
├── data-platform/                      # Data Platform ASSETS (topics, jobs, models, contracts)
├── contracts/                          # CONTRACTS — single source of truth (proto/avro/openapi/...)
├── libs/                               # shared TypeScript libraries
├── py-libs/                            # shared Python libraries
├── sdks/                               # first-party tracking SDKs (browser/server/mobile)
│
├── infrastructure/                     # Infrastructure Platform (Terraform / Helm / ArgoCD bases)
├── deploy/                             # local Docker stack + env overlays
├── docs/                               # documentation hierarchy
├── tools/                              # dev tooling, codegen, generators, scripts
│
├── turbo.json  pnpm-workspace.yaml  pyproject.toml  uv.lock  buf.yaml
├── tsconfig.base.json  .codeowners  .github/  Makefile  README.md
└── PLATFORM.md                         # the map of platforms→pods→phases (this doc's index)

— satellites —
brain-gitops/                           # ArgoCD desired-state (app-of-apps)   (DevOps pod)
brain-sdk-web/  brain-sdk-server/  brain-sdk-mobile/   # public SDK mirrors    (Tracking pod)
```

**The eight top-level platform directories never change across Phase 1→6.** Services are *added into* them per phase; the skeleton is stable.

---

## 5. Detailed Folder Structure (per-platform conventions)

Every **platform directory** follows the same shape:

```
<platform>/
├── README.md               # platform charter: bounded contexts, invariants, owning pod(s)
├── PHASE.md                # which services land in which phase + exit criteria reference
├── <service-a>/            # a deployable service (NestJS or Python) — DDD internal layout (§20/§21)
├── <service-b>/
├── _shared/                # libraries shared ONLY within this platform (not globally)
└── e2e/                    # cross-service contract/integration tests within this platform
```

Every **service directory** is independently deployable and self-describing:

```
<service>/
├── service.yaml            # service manifest: owner pod, SLOs, phase, contracts consumed/produced, data owned
├── Dockerfile
├── chart/                  # Helm chart (values per env) → one ArgoCD app
├── src/                    # DDD / Hexagonal (NestJS §20) or layered (Python §21)
├── test/                   # unit + contract + integration + (where relevant) isolation
├── migrations/             # service-owned DB migrations (no shared tables — Blueprint §2.14)
└── README.md
```

`service.yaml` is the machine-readable ownership/SLO/contract registry that powers the service catalog, CI deploy matrix, and on-call routing.

---

## 6. Product Applications Structure

> Founder Console · Admin Console · AI Assistant · Mobile · Shared UI. Stack: Next.js · React · TS · Tailwind · ShadCN · TanStack Query (web); React Native · Expo (mobile). Owner: **Frontend pod**.

```
apps/
├── web-founder-console/             # Next.js — Home/Command Center, exec dashboards, Morning Brief (web),
│   │                                #   Decision Log, Weekly/Month-End, Sale Mode (BRD §11, Arch §11)
│   ├── app/                         # Next.js App Router (route groups per surface)
│   │   ├── (home)/  (acquisition)/  (finance)/  (logistics)/  (customers)/  (decisions)/
│   │   └── api/                     # route handlers / server actions (BFF passthrough only)
│   ├── components/                  # surface-specific composition (charts, queues, RAG status)
│   ├── features/                    # feature-sliced: each maps to a bounded context read-model
│   ├── lib/                         # tanstack-query clients, BFF SDK, formatters (Indian numbering)
│   └── e2e/                         # Playwright
│
├── web-admin-console/               # org/brand/user/role admin, integration health, billing basis,
│   └── ...                          #   approval-matrix config, kill-switch, governance/audit views
│
├── web-assistant/                   # Natural-language assistant surface (narrates metric-engine figures)
│   └── ...                          #   — may be embedded into founder-console; kept buildable standalone
│
├── mobile/                          # React Native + Expo — Morning Brief is THE primary surface (BRD §11)
│   ├── app/                         # expo-router; thumb-first Brief, approve/reject/edit → Decision Log
│   ├── features/  components/  lib/
│   ├── eas.json                     # EAS Build/Submit profiles (dev/preview/prod)
│   └── e2e/                         # Detox
│
└── packages/                        # SHARED UI LIBRARIES (Frontend pod)
    ├── design-system/               # ShadCN-based primitives, theme, RAG/colour tokens (a11y-safe)
    ├── charts/                      # Recharts/Visx commerce chart kit (CM waterfall, cohort heatmap)
    ├── ui-web/                      # web-only composite components
    ├── ui-mobile/                   # RN-only composite components
    ├── formatters/                  # currency/number/date — INR + AED/SAR locale, RTL-ready (region seam)
    ├── bff-client/                  # generated typed client for the BFF (from contracts/openapi)
    └── feature-flags/               # workspace-scoped flag client (progressive delivery)
```

---

## 7. Platform Foundation Structure

> Identity · Tenancy · Organization · Brand · Membership · RBAC · Governance · Audit · Notification · Configuration · Onboarding. Owner: **Platform-Core pod**. Auth backed by **Keycloak**.

```
platform-foundation/
├── api-gateway-bff/                 # P1 — edge: authn/z, routing, rate-limit, workspace resolution,
│   │                                #        read aggregation. Public REST/GraphQL → internal gRPC. Stateless.
│   └── src/{api,application,infrastructure}/
│
├── auth/                            # P1 — register/login/logout/verify/reset, JWT+refresh, sessions, MFA-ready
│   └── src/...                      #        (Keycloak-backed). Emits user.registered/verified/session.created
│
├── organization/                   # P1 — org lifecycle, settings, billing basis, cross-brand grants
├── brand/                           # P1 — brand (=workspace) lifecycle, workspace-key minting, brand settings
├── membership/                      # P1 — user↔org↔brand mappings, invitations, activation, teams
├── rbac/                            # P1 — brand/feature/API-level permissions; approval-matrix model (scaffold for P5)
├── onboarding/                      # P1 — 7-step onboarding orchestration (org→brand→cost→tracking→integration→validate→activate)
│
├── governance/                      # P1 — IAM, role/approval enforcement, audit log (append-only from day one)
├── audit/                           # P1 — immutable audit trail (WORM/hash-chain); every tenancy/access change
├── notification/                    # P1 — severity-routed alerts (in-product/mobile/email), quiet-hours
├── configuration/                   # P1 — config service: DB/Kafka/Redis/Storage/OAuth/Integrations/Security/Flags
│
└── _shared/                         # tenancy guard helpers, common DTO bases used only within foundation
```

---

## 8. Data Platform Structure

> Two faces: **(A)** runtime *services* for first-party data (§ in `first-party-data/`), and **(B)** *data assets* — Kafka topics, schemas, Flink/Spark jobs, ClickHouse/Iceberg models, data contracts, replay. Owner: **Data Platform pod**.

### 8A. First-Party Data Platform (runtime services)

```
first-party-data/
├── tracking/                        # P1 — issues write keys; receives SDK + server-side events; first-line validation
├── event-ingestion/                # P1 — authenticated ingest; dedupe; publish raw.events (workspace-keyed)
├── event-processing/               # P1 — orchestrates the Flink normalize→enrich→route pipeline (job code in data-platform/)
├── event-validation/               # P1 — schema conformance, required identifiers, consent presence; DLQ routing
├── schema-registry-svc/            # P1 — versioned event schemas; backward-compat evolution; producers fail-closed
├── event-replay/                   # P1 — rebuild derived stores from retained raw log
├── identity-resolution/            # P1 — deterministic key matching in-stream; merge/split; auditable
│   └── (graph overlay)             # P6 — Neo4j probabilistic overlay (disable-able per brand)
├── data-quality/                   # P1 — freshness/dedupe/match/conformance/completeness signals → integration-health
├── reconciliation/                 # P2 — realization-tail corrections (works with realized-revenue-ledger)
└── _shared/
```

### 8B. Data Platform assets

```
data-platform/
├── contracts/                       # DATA CONTRACTS (owned here, surfaced via /contracts)
│   ├── events/                      # event schemas (Avro/JSON-Schema) — page_view…purchase, custom
│   ├── topics/                      # topic definitions: raw / normalized / attributed / signals / decisions
│   └── quality-rules/               # GE/dbt-style assertions, freshness SLAs per dataset
│
├── streaming/                       # Apache Kafka (MSK) + Apache Flink
│   ├── kafka/
│   │   ├── topics/                  # topic-as-code (partitions=workspace_id, retention, compaction)
│   │   └── schema-registry/         # registered subjects + compatibility config
│   └── flink/
│       └── jobs/
│           ├── normalizer/          # source shape → canonical model + region rules
│           ├── identity-resolver/   # deterministic join (+ optional probabilistic overlay)
│           ├── journey-attribution/ # touchpoints→journeys→attribution, reconciled to realized ledger
│           ├── anomaly-detector/    # margin/RTO/fatigue/stockout signals vs learned baseline
│           └── sale-event-mode/     # tight-window pace-vs-forecast (sub-minute alerts)
│
├── batch/                           # Apache Spark
│   └── jobs/
│       ├── revenue-reconciliation/  # the realization-tail job (≤45d corrections)
│       ├── historical-rebuilds/     # replay-driven derived-store rebuilds
│       ├── backfills/               # connector historical backfill transforms
│       └── feature-materialization/ # offline feature builds (feeds Feast — P4)
│
├── warehouse/                       # ClickHouse (OLAP)
│   ├── models/                      # MergeTree tables, ORDER BY (workspace_id first)
│   ├── materialized-views/          # metric/journey/RTO/pincode cubes; read-model serving copies
│   └── migrations/
│
├── lakehouse/                       # S3 + Apache Iceberg
│   ├── tables/                      # raw, normalized, ML datasets, Decision-Log system-of-record
│   └── retention/                   # 13mo hot / 24mo cold tiering + erasure (DPDP/PDPL) policies
│
├── stores/                          # store-specific schema/config kept with data platform
│   ├── postgres/  redis/  opensearch/  neo4j/  pgvector/
│
└── replay/                          # replay pipelines & runbooks (rebuild any derived store)
```

---

## 9. Connector Platform Structure

> Connector Registry + per-connector services. OAuth · Webhooks · Sync · Retry · Health · Write-back. Owner: **Integration pod**. Lean-core: a single ingestion path in P1; **per-connector split from P2/P6** (each provider isolated so one outage/rate-limit affects only its deployment — Arch §4.2).

```
connector-platform/
├── registry/                        # P1 — connector config, OAuth tokens (Secrets Manager), sync/retry state, health
│
├── _kit/                            # shared connector framework (every connector composes this)
│   ├── oauth/                       # auth-code flows, token storage (KMS), auto-refresh, refresh-fail alerts
│   ├── webhook-engine/              # validate + dedupe on arrival
│   ├── sync-engine/                 # initial backfill + incremental; per-connector cursors/state
│   ├── retry-engine/                # exponential backoff + circuit breakers
│   ├── rate-limiter/                # per-provider rate budgets, adaptive throttle
│   ├── health/                      # connected/last-sync/lag/error/completeness → integration-health surface
│   ├── dlq/                         # per-connector DLQ; replayable; never silently dropped
│   └── writeback/                   # idempotent approved-action write-back framework (P5)
│
├── connectors/                      # ONE deployable per provider (split as load/ownership justifies)
│   ├── shopify/                     # P1 Tier 1
│   ├── meta-ads/                    # P1 Tier 1
│   ├── google-ads/                  # P1 Tier 1
│   ├── stripe/                      # P1 Tier 2
│   ├── razorpay/                    # P1 Tier 2
│   ├── shiprocket/                  # P1 Tier 3
│   ├── whatsapp/                    # P1 Tier 3
│   ├── tiktok-ads/                  # P2+
│   ├── crm-hubspot/  crm-salesforce/# P2+
│   ├── marketplaces/                # P2+  (amazon, flipkart, noon, namshi…)
│   ├── gcc/                         # P6   (salla, zid, tabby, tamara…)
│   └── _template/                   # cookiecutter for "future connectors"
│
└── custom-integration-framework/    # P6 — enterprise/custom connectors + light retail/POS ingestion
```

---

## 10. Commerce Intelligence Structure

> Metric Engine · Revenue Ledger · Attribution · Analytics · Dashboard Serving · Executive Analytics · Decision Log. Owner: **Commerce + Platform-Core pods**. **Phase 2.** The metric engine is the most-redundant, most-tested service; **only it produces numbers.**

```
commerce-intelligence/
├── metric-engine/                   # P2 — Tier-0. Deterministic CM1/CM2/CM3 waterfall + MER/aMER/CAC/RTO/COD,
│   │                                #        versioned formula registry. Multi-version zero-downtime.
│   └── src/
│       ├── domain/formulas/         # canonical formula definitions (versioned; TS↔Python parity via contracts)
│       ├── domain/registry/         # formula registry + lineage/freshness/estimate-flag metadata
│       └── ...                      # NEVER called synchronously by surfaces (read-model builder fronts it)
│
├── realized-revenue-ledger/         # P2 — financial golden record; short-horizon stream state + long-horizon
│   │                                #        reconciliation of the ≤45d realization tail; append-only corrections
│   └── src/...
│
├── attribution/                     # P2 — first/last/linear/position/data-driven, reconciled to realized ledger
├── journey-builder/                 # P2 — sessions, touchpoints, ordered journeys
├── analytics/                       # P2 — store/acquisition/lifecycle/product/logistics/finance metric assembly
├── read-model-builder/              # P2 — CQRS pre-materialize Home/Brief/dashboard payloads (instant reads)
├── dashboard-serving/               # P2 — serves pre-materialized exec/role dashboards to BFF
├── executive-analytics/             # P2 — CEO/CMO/COO/CFO/CTO role views over one dataset
├── decision-log/                    # P2(foundation)→P5(full) — append-only recommendation→outcome ledger (THE MOAT)
│
├── incrementality/                  # P4 — holdouts, lift, geo experiments (recovered-revenue proof)
├── mmm/                             # P4 foundation → P6 full — media-mix modelling (mostly in ai-platform; serving here)
│
└── domain-services/                 # commerce-adjacent domain bounded contexts
    ├── logistics-rto/               # P2 — NDR/courier/pincode intelligence, RTO cost, courier-switch actions
    ├── inventory/                   # P2 — real-time stock cover / days-of-cover
    ├── finance-cash/                # P2 — P&L, settlement timing, refund liability, cash conversion, scenarios
    ├── forecasting/                 # P4 — demand prediction (model in ai-platform; orchestration here)
    ├── procurement/                 # P4 — reorder / PO generation
    └── vendor/                      # P6 — supplier/vendor management
```

---

## 11. Customer Intelligence Structure (CDP)

> Customer 360 · Segmentation · Audience Builder · Journey Analytics · Customer Health · Audience Activation. Owner: **CDP + Growth pods**. **Phase 3** (identity foundation from P1).

```
customer-intelligence/
├── customer-360/                    # P3 — unified profile assembled from identity+profile+consent+behaviour
├── customer-profile/                # P3 — attributes, demographics, behavioural traits, RFM/RFMC, commerce profile
├── consent/                         # P3 (enforced) — channel/purpose/region consent, withdrawal, suppression;
│   └── ...                          #        DPDP Consent-Manager compatible; enforced on every outbound message
├── segmentation/                    # P3 — RFM/RFMC segments; deterministic-first health/at-risk/churn signals
├── audience/                        # P3 — reusable audiences (build-once); membership materialization; activation contracts
├── audience-activation/             # P3→P5 — activate audiences to ad/messaging rails (consent + frequency checks)
├── journey-analytics/              # P3 — path-to-purchase, sequences, time-to-conversion, assists → realized revenue
├── customer-health/                 # P3 — recency/frequency at-risk + churn-likelihood (heuristic; ML overlay P4)
└── search/                          # P3 — customer/order/ticket search (OpenSearch)

# Support/Inbox is a CDP-adjacent Operations-owned context:
└── support-inbox/                   # P3 — classify/enrich/route tickets; support-to-commerce feedback events
```

---

## 12. Agent Platform Structure

> Agent Runtime · Recommendation · Guardrails · Approval · Execution · Reversal · Outcome Tracking · Learning Loop. Owner: **Platform-Core + AI Platform**. **Phase 5.** TS for orchestration/guardrail/execution (NestJS + Temporal); **reasoning runtimes are Python** (in `ai-platform/agents`). Orchestration = **LangGraph**; execution = **Temporal**.

```
agent-platform/
├── orchestrator/                    # P5 — LangGraph-based; coordinates execution only, holds NO business logic;
│   │                                #        ranks by margin impact, urgency, confidence, risk, reversibility
│   └── src/...                      #        (reasoning delegated to ai-platform/agents runtimes)
│
├── guardrail/                       # P5 — SYNCHRONOUS gate before every write-back: caps, confidence thresholds,
│   │                                #        consent checks, approval matrix, global kill switch (<60s propagation)
│   └── src/...                      #        ← Security co-owns (CODEOWNERS)
│
├── approval/                        # P5 — approval-matrix engine + human-in-the-loop states (BRD §7.3)
├── execution/                       # P5 — Temporal workflows: durable, idempotent, reversible; 7d/30d outcome scheduling
│   │                                #        ← Security co-owns
│   └── temporal/workflows/  activities/
├── reversal/                        # P5 — reverse-button workflows where safe; auto-revert to recommend-only on breach
├── outcome-tracking/                # P5 — 7d/30d outcome measurement → Decision Log + learning loop
└── learning-loop/                   # P5 — condition-outcome memory + Brand Fingerprint drive future ranking

# Action API surface for approved actions is exposed via api-gateway-bff.
```

---

## 13. AI Platform Structure

> Feature Store · Feature Engineering · Model Registry · Training · Inference · Evaluation · Memory · LLM Gateway. Supports forecasting, RTO/churn/LTV, budget optimization, creative intelligence. Owner: **AI Platform pod**. **Phase 4.** **Python** · FastAPI · BentoML · PyTorch · scikit-learn · Spark · Feast · MLflow · LangSmith/Ragas. **Advisory only; subordinate to the deterministic core.**

```
ai-platform/
├── services/                        # Python AI/ML services (template §21)
│   ├── feature-engineering/         # P4 — feature gen/validation/transform; online/offline parity (Spark+Feast)
│   ├── feature-store/               # P4 — Feast online (Redis) + offline (S3/Iceberg) registry/config
│   ├── model-training/              # P4 — train/retrain/experiment; challengers in shadow (PyTorch/sklearn/MLflow)
│   ├── model-registry/              # P4 — MLflow versioning + promotion on measured outperformance
│   ├── model-serving/               # P4 — prediction APIs / online inference (FastAPI/BentoML); calibration bands
│   ├── evaluation/                  # P4 — agent/prompt/retrieval eval + model benchmarking (LangSmith/Ragas)
│   └── model-monitoring/            # P4 — drift/calibration → observability; auto-fallback to deterministic heuristic
│
├── models/                          # model packages (one dir per model family)
│   ├── rto-prediction/              # P4 — product-critical; region-specific; break-even COD fallback
│   ├── ltv/  churn/  demand-forecasting/   # P4
│   ├── creative-fatigue/  budget-optimization/   # P4
│   └── data-driven-attribution/     # P4 — product-critical
│
├── agents/                          # P5 — per-discipline reasoning runtimes (Python; orchestrated by agent-platform)
│   ├── _base/                       # Agent base class, paradigm/tool decorators, daily-tick → brief, memory query
│   ├── marketing/                   # budget, creative, lifecycle, acquisition
│   ├── operations/                  # logistics, inventory, support
│   ├── finance/                     # margin, forecasting, cashflow
│   └── planning/                    # weekly, monthly, scenario
│
├── memory/                          # P4→P5 — pgvector memory: Brand Fingerprint, condition-outcome, creative,
│   └── ...                          #          cross-brand benchmarks (privacy-thresholded, opt-in), RAG retrieval
│
└── pipelines/                       # training/eval pipelines, Ragas golden sets, registry promotion gates

# LLM Gateway is a shared-platform service (below) owned by AI Platform.
```

---

## 14. Shared Libraries Structure

> Authentication · Authorization · Event Contracts · API Contracts · OpenAPI · Kafka Contracts · Temporal Contracts · DTOs · Observability · Security · SDKs · Utilities. (Contract *definitions* live in `/contracts`; these are the runtime libraries that consume them.)

```
libs/                                # shared TypeScript libraries (consumed by all NestJS services + apps)
├── tenancy/                         # ★ workspace-key data-access guard (MANDATORY dep of every service) — P5 invariant
├── auth/                            # Keycloak JWT verify, session, refresh, MFA helpers
├── authz/                           # RBAC enforcement (brand/feature/API scopes), approval-matrix checks
├── contracts-ts/                    # GENERATED TS types/clients from /contracts (proto/avro/openapi/asyncapi)
├── dto/                             # canonical domain DTOs / value objects
├── events/                          # Kafka producer/consumer base (Avro serde, Schema Registry client, DLQ, idempotency)
├── temporal/                        # Temporal client + typed workflow/activity stubs
├── observability/                   # OpenTelemetry tracing (workspace + decision IDs), structured logging, metrics
├── security/                        # input validation, output encoding, PII redaction, KMS/secrets helpers
├── region/                          # region-adapter client (tax/consent/calendar/provider rules)
├── idempotency/                     # idempotency-key helpers (Redis + Postgres dedup)
├── metric-client/                   # the ONLY way to read a figure — thin client to metric-engine (no local math)
├── http/  config/  errors/  testing/ # framework/utilities
└── feature-flags/                   # workspace-scoped flag client + kill-switch hooks

py-libs/                             # shared Python libraries (consumed by all AI services + agents)
├── tenancy/                         # workspace-key guard (Python parity)
├── contracts-py/                    # GENERATED Python types/clients from /contracts (proto/avro)  ← TS↔Py parity
├── metrics/                         # metric-engine client + formula parity tests vs libs/metric-client
├── events/                          # aiokafka + Avro serde + Schema Registry
├── observability/                   # OTel for Python
├── llm/                             # LLM gateway client (paradigm routing, prompt cache)
├── features/                        # Feast client helpers
├── eval/                            # Ragas/LangSmith harness helpers
└── utils/
```

`shared-platform/` (cross-cutting *services*, not libraries):

```
shared-platform/
├── region-adapter/                  # P1 — inject tax/consent/logistics/calendar/provider rules into every service
├── llm-gateway/                     # P1/P4 — route prompts by complexity; enforce "AI quotes computed figures only"
├── notification/                    # P1 — severity-routed alerts (also referenced in platform-foundation)
├── search/                          # P3 — OpenSearch-backed search service
└── aggregation-zone/                # P6 — governed cross-region aggregated/anonymized portfolio rollups
```

---

## 15. Contracts Structure

> The single source of truth. Changed atomically with producers + consumers; `buf breaking` + contract tests gate merges; codegen → **both** TS and Python. This is what makes *"only the metric engine produces numbers"* and TS↔Python parity structural, not aspirational.

```
contracts/
├── buf.yaml  buf.gen.yaml           # buf config + codegen plugins (ts + python)
│
├── proto/                           # gRPC / internal sync APIs (also MCP-style tool schemas)
│   ├── platform/  commerce/  cdp/  agents/  ai/  connectors/
│   └── common/                      # shared messages: Money, WorkspaceKey, Lineage, Confidence, Estimate flag
│
├── events/                          # ASYNC contracts — the event-driven backbone
│   ├── avro/                        # Avro schemas registered in Schema Registry (raw→normalized→…→decisions)
│   ├── asyncapi/                    # AsyncAPI docs per topic (producers/consumers, ordering=workspace_id)
│   └── topics.yaml                  # canonical topic registry (partitions, retention, owners)
│
├── openapi/                         # BFF ↔ web/mobile REST/GraphQL contracts (drives apps/packages/bff-client)
│
├── temporal/                        # workflow + activity interface contracts (execution/reversal/approval)
│
├── tracking/                        # first-party event JSON-Schema (browser/server/mobile SDK contract)
│
├── metrics/                         # ★ the Formula Book: canonical metric definitions (one source, TS+Py generated)
│   └── registry.yaml                #   ← metric-engine + libs/metric-client + py-libs/metrics all generate from here
│
├── data-contracts/                  # ingest data contracts + quality rules (surfaced from data-platform)
│
└── security/                        # auth scopes, RBAC role/permission catalog, approval-matrix definition
```

**Rule:** no schema is defined anywhere else. A producer change + consumer changes + generated clients all land in **one PR**, gated by `buf breaking`, contract tests, and (for metrics) the **TS↔Python parity test**.

---

## 16. Infrastructure Structure

> Terraform · EKS · Networking · Security · ArgoCD · GitHub Actions · Environment Management. Owner: **DevOps/SRE pod**. Footprint grows India-only (P1–5) → multi-region (P6) with **no structural change** (Blueprint §9.2).

```
infrastructure/
├── terraform/
│   ├── modules/                     # reusable modules (one per platform capability)
│   │   ├── vpc/  networking/  eks/  karpenter/  msk/  schema-registry/
│   │   ├── aurora/  clickhouse/  redis-elasticache/  opensearch/
│   │   ├── s3-iceberg/  neo4j/  temporal/  keycloak/  feast/  mlflow/
│   │   ├── kms/  secrets/  waf/  cloudfront/  api-gateway/
│   │   └── observability/           # prometheus/grafana/loki/tempo/otel-collector
│   │
│   ├── stacks/                      # per-environment composition of modules
│   │   ├── _global/                 # accounts, IAM, ECR, DNS, org-wide
│   │   └── regions/
│   │       ├── ap-south-1/          # India — live P1+
│   │       │   ├── dev/ qa/ uat/ staging/ production/
│   │       ├── me-central-1/        # UAE — P6
│   │       └── me-south-1/          # KSA — P6
│   │
│   └── backends/                    # remote state config per region/env
│
├── kubernetes/
│   ├── base/                        # Helm chart bases / Kustomize bases shared by services
│   ├── platform/                    # cluster add-ons (cert-manager, external-secrets, otel, karpenter)
│   └── argocd/                      # ArgoCD bases (synced from brain-gitops; see §17)
│
├── security/
│   ├── network-policies/  pod-security/  rbac-k8s/
│   ├── kms-key-policies/            # per-tenant keys (enterprise, P6)
│   └── scanners/                    # trivy/checkov/gitleaks configs
│
└── observability/                   # dashboards-as-code, alert rules, SLO definitions (see §23)
```

---

## 17. Deployment Structure

> Two modes from Phase 1 (Blueprint §9): **single-command local Docker** and **AWS production via Terraform + ArgoCD GitOps**.

### 17A. Local development (one command)

```
deploy/
├── local/
│   ├── docker-compose.yml           # base: all services
│   ├── compose/                     # layered overrides
│   │   ├── infra.yml                # postgres, redis, kafka+ui, schema-registry, minio(S3), keycloak,
│   │   │                            #   clickhouse, opensearch, temporal, mailhog, neo4j(optional)
│   │   ├── services.yml             # all NestJS services
│   │   ├── ai.yml                   # python AI services (profile-gated)
│   │   └── mocks.yml                # connector provider mocks (shopify/meta/google/…)
│   ├── seed/                        # seed brands, users, cost configs, sample events
│   ├── bootstrap.sh                 # keycloak realm, kafka topics, CH schemas, migrations
│   └── Makefile                     # `make up` → entire platform locally (BRD requirement)
└── README.md                        # "start the whole platform with one command"
```

### 17B. Production (GitOps — the `brain-gitops` satellite)

```
brain-gitops/                        # ArgoCD desired-state — CI writes image tags here, ArgoCD reconciles
├── app-of-apps.yaml                 # root application
├── projects/                        # ArgoCD AppProjects per platform (RBAC boundaries)
├── applications/                    # one Application per service per env
│   └── <env>/<platform>/<service>.yaml
├── values/                          # Helm values per service per env
│   └── <env>/<region>/<service>.yaml
└── overlays/
    └── regions/ap-south-1/ me-central-1/ me-south-1/
```

CI flow (Blueprint §11): GitHub Actions → test/contract/event/isolation → build/sign → **ECR** → bump tag in `brain-gitops` → ArgoCD auto-sync (non-prod) / gated promotion (prod) → canary → auto-rollback. Money-moving changes require Security sign-off + shadow validation.

---

## 18. Environment Structure

> Six profiles (Blueprint §9.1). Same code, config-only differences — *no hardcoded environment values.*

| Env | Purpose | Topology | Region(s) |
|---|---|---|---|
| **local** | Dev inner loop, local CI | Docker Compose, one-command | — |
| **dev** | Shared integration | Reduced EKS; ephemeral PR-preview namespaces; synthetic data | ap-south-1 |
| **qa** | Contract/integration/event/isolation suites | Full service set, small scale; seeded test brands | ap-south-1 |
| **uat** | Business acceptance | Production-like; design-partner validation | ap-south-1 |
| **staging** | Soak, load, chaos, DR drills | Mirrors prod per region; RC soak | ap-south-1 (+UAE/KSA P6) |
| **production** | Live brands | Multi-AZ; festival pre-warm; load-shed; SLOs enforced | India P1–5; +UAE+KSA P6 |

Config lives as overlays (`deploy/` + `brain-gitops/values/`), categorized: Database · Kafka · Redis · Storage · OAuth · Integrations · Security · Feature Flags.

```
config/
├── _schema/                         # zod/JSON-schema for every config category (validated at boot)
├── local/ dev/ qa/ uat/ staging/ production/
└── regions/ ap-south-1/ me-central-1/ me-south-1/
```

---

## 19. Documentation Structure

```
docs/
├── README.md  PLATFORM.md           # platform map (pods × platforms × phases)
├── architecture/
│   ├── solution-architecture.md     # (source doc)
│   ├── brd.md  implementation-blueprint.md
│   ├── invariants.md                # the gating invariants (Blueprint §1.2) — each links to its test
│   ├── c4/                          # context/container/component diagrams
│   └── data-flow.md                 # end-to-end sense→…→learn flow
├── adr/                             # Architecture Decision Records (numbered; CTO-owned)
│   └── 0001-hybrid-monorepo.md  0002-turborepo-uv.md  0003-contracts-source-of-truth.md ...
├── api/                             # generated API specs (from contracts/) + usage guides
├── runbooks/                        # one per service: alerts, dashboards, on-call, kill-switch
├── operations/                      # SLOs, capacity, festival pre-warm, load-shedding, FinOps per region
├── onboarding/                      # engineer onboarding, local-setup, pod guides, glossary
├── security/                        # threat models (STRIDE), SOC2/ISO evidence, PCI SAQ-A boundary, MASVS
├── compliance/                      # DPDP+Rules, TCCCPR-DLT, NCPR-DND, calling-hours, PDPL, consent
├── disaster-recovery/               # RPO 5m / RTO 1h, per-region DR drills, replay-rebuild procedures
├── data-governance/                 # residency, retention (13mo/24mo), erasure, lineage, data contracts
├── ai-governance/                   # model cards, calibration bands, fallback policy, eval gates, decision-log policy
└── program/                         # EPM: phase entry/exit criteria, dependency graph, roadmap, RACI
```

---

## 20. NestJS Service Template

> DDD + Clean + Hexagonal. The dependency rule points **inward**: `domain` knows nothing of `infrastructure`. Internal structure is **by bounded context, never by `controllers/`/`services/`/`models/`.**

```
<service>/                           # e.g. commerce-intelligence/metric-engine
├── service.yaml                     # owner pod, SLOs, phase, contracts consumed/produced, data owned
├── Dockerfile  chart/  README.md
├── nest-cli.json  tsconfig.json  project.json
├── src/
│   ├── main.ts                      # bootstrap: OTel, config validation, health probes, graceful shutdown
│   ├── app.module.ts
│   │
│   ├── <context>/                   # ONE folder per bounded context inside the service
│   │   ├── api/                     # ── inbound adapters (driving side)
│   │   │   ├── http/                #     controllers (REST/GraphQL) — thin
│   │   │   ├── grpc/                #     gRPC handlers (from contracts/proto)
│   │   │   └── consumers/           #     Kafka event consumers
│   │   │
│   │   ├── application/             # ── use cases (orchestration; no framework, no SQL)
│   │   │   ├── commands/  queries/  # CQRS split (commands mutate, queries read)
│   │   │   ├── ports/               #     interfaces the domain needs (repositories, gateways)
│   │   │   └── dto/                 #     application DTOs (mapped from contracts/dto)
│   │   │
│   │   ├── domain/                  # ── PURE domain (no imports from infra/framework)
│   │   │   ├── model/               #     aggregates, entities, value objects
│   │   │   ├── events/              #     domain events
│   │   │   ├── services/            #     domain services (invariants/policies)
│   │   │   └── errors/
│   │   │
│   │   └── infrastructure/          # ── outbound adapters (driven side)
│   │       ├── persistence/         #     repository impls, ORM mappings, migrations
│   │       ├── messaging/           #     Kafka producers (Avro serde via libs/events)
│   │       ├── clients/             #     gRPC/REST clients (metric-client, region, others)
│   │       └── config/
│   │
│   └── shared/                      # service-local cross-context helpers (NOT global libs)
│
├── migrations/                      # service-owned schema (workspace_id + RLS; no shared tables)
└── test/
    ├── unit/                        # domain + application (no I/O)
    ├── contract/                    # Pact/buf consumer & provider tests against /contracts
    ├── integration/                 # against compose infra
    ├── isolation/                   # ★ workspace-leak tests (CI gate)
    └── e2e/
```

**Mandatory cross-cutting deps** (enforced by lint): `libs/tenancy`, `libs/observability`, `libs/auth`+`libs/authz`, `libs/contracts-ts`. Any service quoting a business figure imports `libs/metric-client` and is **forbidden** from computing one locally (contract test).

---

## 21. Python AI Service Template

> FastAPI + BentoML serving; clean layering; every prediction is outcome-tracked in the Decision Log; calibration band with deterministic fallback.

```
<service>/                           # e.g. ai-platform/services/model-serving
├── service.yaml  Dockerfile  chart/  README.md
├── pyproject.toml                   # uv-managed; depends on py-libs/*
├── app/
│   ├── main.py                      # FastAPI app: OTel, config validation, health, /predict
│   ├── api/                         # ── inbound: FastAPI routers / BentoML services / Kafka consumers
│   │   ├── http/  grpc/  consumers/
│   ├── application/                 # ── use cases: predict, train, evaluate, materialize
│   │   ├── ports/  dto/
│   ├── domain/                      # ── pure: feature defs, model contracts, calibration policy
│   │   ├── features/  models/  evaluation/  policies/   # fallback-to-heuristic, confidence-floor routing
│   └── infrastructure/             # ── outbound adapters
│       ├── feast/                   #     feature store (online Redis / offline Iceberg)
│       ├── mlflow/                  #     registry load/promote
│       ├── serving/                 #     BentoML/torch runtime
│       ├── llm/                     #     llm-gateway client (py-libs/llm)
│       ├── messaging/               #     aiokafka producers (predictions as events)
│       └── decision_log/            #     write every prediction as an outcome-tracked entry
│
├── models/                          # model artifacts/cards/configs (per model family)
│   ├── training/                    # training entrypoints + Spark jobs refs
│   ├── inference/                   # serving graph
│   └── cards/                       # model card, calibration band, intended use, fallback
│
└── tests/
    ├── unit/                        # feature/transform/policy logic
    ├── contract/                    # against /contracts (proto/avro) — TS↔Py parity for any shared metric
    ├── eval/                        # Ragas/golden-set gates (ship only if ≥ baseline)
    ├── calibration/                 # drift/calibration band tests
    └── integration/
```

**Mandatory deps:** `py-libs/tenancy`, `py-libs/observability`, `py-libs/contracts-py`, `py-libs/metrics` (parity), `py-libs/llm`. **Rule:** an AI service emits predictions/scores/text only — **never a business figure** (figures come from the metric engine; enforced by contract test).

---

## 22. CI/CD Structure

```
.github/
├── workflows/
│   ├── pr.yml                       # turbo/uv --affected → lint, typecheck, unit, contract, event, ISOLATION
│   ├── contracts.yml                # buf lint + buf breaking; TS↔Py metric-parity; codegen drift check
│   ├── build-and-push.yml           # affected services → docker build → cosign sign → ECR push
│   ├── gitops-bump.yml              # write image tags to brain-gitops (per env)
│   ├── metric-golden.yml            # (P2+) metric-engine golden tests
│   ├── model-calibration.yml        # (P4+) model calibration within band before promote
│   ├── isolation-gate.yml           # ★ cross-tenant leak suite — blocks release (any phase)
│   ├── security-scan.yml            # trivy/checkov/gitleaks/semgrep; money-moving paths require Security approval
│   ├── mobile-eas.yml               # EAS Build/Submit; OTA for JS-only; native bumps → store review
│   └── nightly-soak.yml             # staging load/chaos/DR drill
│
├── actions/                         # composite actions (setup-turbo-cache, setup-uv, otel-annotate)
└── CODEOWNERS
```

**Quality gates (Blueprint §11.2):** merge→main = unit+contract+event+isolation green + coverage; promote→staging = integration + (P2+) metric golden + no SLO regression; promote→prod = load+chaos soak + (P4+) calibration + security/isolation re-verified + DR drill current; **phase exit** = exit criteria signed in Office-of-CTO review.

**Build matrix is the affected graph:** Turborepo `--affected` (TS) + uv/`affected` (Python) compute exactly which services changed; only those build, test, and deploy. This is what keeps CI fast at 100+ services.

---

## 23. Observability Structure

> OpenTelemetry · Prometheus · Grafana · Loki · Tempo. Every service emits logs/metrics/traces tagged with **workspace_id + decision_id** — which doubles as the backbone for explaining any figure or action (Arch §12.5).

```
observability/                       # (under infrastructure/, dashboards-as-code)
├── otel/
│   ├── collector/                   # OTel Collector config (per env)
│   └── instrumentation/             # conventions: workspace_id, decision_id, formula_version, model_version
├── prometheus/
│   ├── rules/                       # recording + alerting rules (burn-rate per SLO)
│   └── slo/                         # SLO definitions per service (latency, freshness, error budget)
├── grafana/
│   └── dashboards/                  # per-platform dashboards (commerce, cdp, ai, connectors, data-platform)
│       ├── reversal-rate.json       # P5 — auto-revert trigger visibility
│       ├── model-calibration.json   # P4 — drift/calibration
│       └── data-quality.json        # freshness/dedupe/match/completeness → integration health
├── loki/                            # structured-log pipeline (PII redaction enforced)
├── tempo/                           # distributed tracing (workspace+decision correlation)
└── runbooks-index.md                # alert → runbook mapping (links to docs/runbooks)
```

Domain-specific signals that **gate product behaviour** (not just ops): data-quality freshness gates recommendations; reversal-rate breach auto-reverts to recommend-only; model calibration breach auto-falls-back to heuristic; cost-to-serve per brand feeds the margin-safety dashboard (FinOps).

---

## 24. Final Complete Repository Tree

```
brain/                                                  # PRIMARY MONOREPO — Turborepo + pnpm + uv
│
├── apps/                                               # ① PRODUCT APPLICATIONS                [Frontend]
│   ├── web-founder-console/   web-admin-console/   web-assistant/
│   ├── mobile/                                          # React Native + Expo (Morning Brief = primary surface)
│   └── packages/  design-system/ charts/ ui-web/ ui-mobile/ formatters/ bff-client/ feature-flags/
│
├── platform-foundation/                                # ② PLATFORM FOUNDATION                 [Platform-Core]
│   ├── api-gateway-bff/  auth/  organization/  brand/  membership/  rbac/  onboarding/
│   ├── governance/  audit/  notification/  configuration/   _shared/
│
├── first-party-data/                                   # ③ FIRST-PARTY DATA PLATFORM           [Data + Tracking]
│   ├── tracking/  event-ingestion/  event-processing/  event-validation/  schema-registry-svc/
│   ├── event-replay/  identity-resolution/  data-quality/  reconciliation/   _shared/
│
├── connector-platform/                                 # ④ CONNECTOR PLATFORM                  [Integration]
│   ├── registry/
│   ├── _kit/  oauth/ webhook-engine/ sync-engine/ retry-engine/ rate-limiter/ health/ dlq/ writeback/
│   ├── connectors/  shopify/ meta-ads/ google-ads/ stripe/ razorpay/ shiprocket/ whatsapp/
│   │                tiktok-ads/ crm-*/ marketplaces/ gcc/ _template/
│   └── custom-integration-framework/                   # P6
│
├── commerce-intelligence/                              # ⑤ COMMERCE INTELLIGENCE               [Commerce + Platform-Core]
│   ├── metric-engine/  realized-revenue-ledger/  attribution/  journey-builder/  analytics/
│   ├── read-model-builder/  dashboard-serving/  executive-analytics/  decision-log/
│   ├── incrementality/  mmm/
│   └── domain-services/  logistics-rto/ inventory/ finance-cash/ forecasting/ procurement/ vendor/
│
├── customer-intelligence/                              # ⑥ CUSTOMER INTELLIGENCE (CDP)         [CDP + Growth]
│   ├── customer-360/  customer-profile/  consent/  segmentation/  audience/  audience-activation/
│   ├── journey-analytics/  customer-health/  search/  support-inbox/
│
├── agent-platform/                                     # ⑦ AGENT PLATFORM                      [Platform-Core + AI]
│   ├── orchestrator/  guardrail/  approval/  execution/  reversal/  outcome-tracking/  learning-loop/
│
├── ai-platform/                                        # ⑧ AI / ML PLATFORM (Python)           [AI Platform]
│   ├── services/  feature-engineering/ feature-store/ model-training/ model-registry/
│   │              model-serving/ evaluation/ model-monitoring/
│   ├── models/   rto-prediction/ ltv/ churn/ demand-forecasting/ creative-fatigue/
│   │             budget-optimization/ data-driven-attribution/
│   ├── agents/   _base/ marketing/ operations/ finance/ planning/
│   ├── memory/                                          # pgvector: brand fingerprint, condition-outcome
│   └── pipelines/
│
├── shared-platform/                                    # CROSS-CUTTING SERVICES
│   ├── region-adapter/  llm-gateway/  notification/  search/  aggregation-zone/   (P6)
│
├── data-platform/                                      # DATA PLATFORM ASSETS                  [Data Platform]
│   ├── contracts/  events/ topics/ quality-rules/
│   ├── streaming/  kafka/{topics,schema-registry}  flink/jobs/{normalizer,identity-resolver,
│   │               journey-attribution,anomaly-detector,sale-event-mode}
│   ├── batch/      spark/jobs/{revenue-reconciliation,historical-rebuilds,backfills,feature-materialization}
│   ├── warehouse/  clickhouse/{models,materialized-views,migrations}
│   ├── lakehouse/  iceberg/{tables,retention}
│   ├── stores/     postgres/ redis/ opensearch/ neo4j/ pgvector/
│   └── replay/
│
├── contracts/                                          # CONTRACTS — SINGLE SOURCE OF TRUTH    [CTO + Architects]
│   ├── buf.yaml buf.gen.yaml
│   ├── proto/{platform,commerce,cdp,agents,ai,connectors,common}
│   ├── events/{avro,asyncapi,topics.yaml}
│   ├── openapi/   temporal/   tracking/
│   ├── metrics/registry.yaml                            # ★ the Formula Book (TS+Py generated)
│   ├── data-contracts/   security/
│
├── libs/                                               # SHARED TYPESCRIPT LIBS
│   ├── tenancy/ auth/ authz/ contracts-ts/ dto/ events/ temporal/ observability/
│   ├── security/ region/ idempotency/ metric-client/ http/ config/ errors/ testing/ feature-flags/
│
├── py-libs/                                             # SHARED PYTHON LIBS
│   ├── tenancy/ contracts-py/ metrics/ events/ observability/ llm/ features/ eval/ utils/
│
├── sdks/                                               # FIRST-PARTY TRACKING SDKs             [Tracking/SDK]
│   ├── browser/  server/  mobile/  core/                # → mirrored to brain-sdk-* public repos
│
├── infrastructure/                                     # INFRASTRUCTURE PLATFORM               [DevOps/SRE]
│   ├── terraform/  modules/{vpc,networking,eks,karpenter,msk,schema-registry,aurora,clickhouse,
│   │               redis-elasticache,opensearch,s3-iceberg,neo4j,temporal,keycloak,feast,mlflow,
│   │               kms,secrets,waf,cloudfront,api-gateway,observability}
│   │               stacks/{_global,regions/{ap-south-1,me-central-1,me-south-1}/{dev,qa,uat,staging,production}}
│   │               backends/
│   ├── kubernetes/ base/ platform/ argocd/
│   ├── security/   network-policies/ pod-security/ rbac-k8s/ kms-key-policies/ scanners/
│   └── observability/  otel/ prometheus/ grafana/ loki/ tempo/ runbooks-index.md
│
├── deploy/                                             # DEPLOYMENT
│   ├── local/  docker-compose.yml compose/{infra,services,ai,mocks}.yml seed/ bootstrap.sh Makefile
│   └── (prod desired-state lives in brain-gitops satellite)
│
├── config/                                             # ENVIRONMENT CONFIG (no hardcoded values)
│   ├── _schema/  local/ dev/ qa/ uat/ staging/ production/  regions/{ap-south-1,me-central-1,me-south-1}/
│
├── docs/                                               # DOCUMENTATION
│   ├── architecture/ adr/ api/ runbooks/ operations/ onboarding/
│   ├── security/ compliance/ disaster-recovery/ data-governance/ ai-governance/ program/
│
├── tools/                                              # DEV TOOLING
│   ├── generators/  service-templates/ (nestjs, python-ai, connector cookiecutters)
│   ├── codegen/  ci/  scripts/  service-catalog/        # reads every service.yaml
│
├── .github/  workflows/ actions/ CODEOWNERS
├── turbo.json  pnpm-workspace.yaml  package.json  tsconfig.base.json
├── pyproject.toml  uv.lock  buf.yaml  .gitignore  Makefile
├── PLATFORM.md  README.md
│
└── ── SATELLITE REPOSITORIES ──
    ├── brain-gitops/        app-of-apps.yaml projects/ applications/<env>/ values/<env>/<region>/ overlays/
    ├── brain-sdk-web/  brain-sdk-server/  brain-sdk-mobile/      # public, semver, mirrored from sdks/
    └── brain-edge/          # optional P6 edge collector
```

---

## Appendix A — Phase Fill Order (structure is fixed; services land per phase)

| Platform dir | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| platform-foundation | ●●● all | — | — | — | rbac→approval | enterprise-gov |
| first-party-data | ●● core | reconciliation | — | — | — | identity-graph(Neo4j) |
| connector-platform | registry+9 conns | tiktok/crm/mkts | — | — | writeback | per-conn split, custom |
| commerce-intelligence | — | ●● metric/ledger/attr/decision-log | — | incrementality/mmm, forecasting | decision-log full | mmm full, vendor |
| customer-intelligence | identity foundation only | — | ●● all CDP | health ML overlay | activation rails | — |
| agent-platform | — | — | — | — | ●● all | — |
| ai-platform | — | — | — | ●● MLOps+models | agents+memory | advanced MLOps |
| data-platform | streaming/lakehouse | flink attr + spark recon | journey/opensearch | feast/training | temporal | per-region+aggregation |
| infrastructure | India single-region | — | opensearch | gpu pools/feast/mlflow | temporal | multi-region+neo4j |

**No directory is created or moved between phases — only filled.** This is the structural guarantee that Brain runs Phase 1 → Phase 6 without repository restructuring.

## Appendix B — The structural enforcement of the five gating invariants (Blueprint §1.2)

| Invariant | Structural home | CI gate |
|---|---|---|
| Only metric engine produces numbers | `commerce-intelligence/metric-engine` + `libs/metric-client`/`py-libs/metrics` | `contracts.yml` parity + "no-figure-emitted" contract test |
| Every state change = Kafka event; money-moving = separate sync idempotent path | `contracts/events` + `data-platform/streaming`; `agent-platform/{guardrail,execution}` | event contract tests; money-moving Security gate |
| Workspace key at data-access layer + RLS | `libs/tenancy` (mandatory dep) + per-service `migrations` RLS | `isolation-gate.yml` (blocks any release) |
| Region rules = config via adapter, never forks | `shared-platform/region-adapter` + `libs/region` + `config/regions` | lint: no geography-forked product code |
| Realized over placed | `commerce-intelligence/realized-revenue-ledger` + `data-platform/batch/revenue-reconciliation` | `metric-golden.yml` realized-revenue tests |
