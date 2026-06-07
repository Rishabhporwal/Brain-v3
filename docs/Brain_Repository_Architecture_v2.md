# Brain — Repository & Platform Architecture (v2, Refined)

**Status:** Supersedes `Brain_Repository_Architecture.md` (v1). Owner: Chief Architect + platform leads.
**Strategy:** Hybrid monorepo · **Turborepo** (orchestration) + **pnpm** (TS/JS) + **uv** (Python), one workspace graph.
**Organizing axis:** business domains → bounded contexts → platform capabilities → **ownership** (team + service + deployment).
Technology never dictates the top level. Language never dictates the top level. **Ownership does.**

Targets: Phase 1→6 evolution · 100+ services · 50–100+ engineers · multi-region (IN/AE/GCC) · enterprise · independent
deployability · AI + agentic · event-driven · 5–10 year maintainability.

---

## Part 0 — Review of the existing proposal (v1)

### What v1 got right (keep)
- **Domain/platform-driven top level**, not language/tier. Correct foundational decision.
- **Hybrid monorepo + Turborepo + pnpm**, contracts-as-source-of-truth, phased "structure is fixed, services land per phase."
- **NestJS DDD/Hexagonal/CQRS** service template; **Python AI** service template; per-pod CODEOWNERS.
- The **five gating invariants** encoded structurally (metric engine is the only number-producer, etc.).

### Weaknesses & gaps found (fix in v2)
| # | Weakness in v1 / on-disk | Impact | v2 fix |
|---|---|---|---|
| W1 | **Data *layer* mixed with data *platform*** — schemas/migrations live under `data-platform/stores` + `/warehouse` alongside services | Data eng can't own physical schemas independently of service teams; migrations entangled with service deploys | Split: top-level **`data/`** = physical stores (schemas, migrations, models, retention) owned by Data Platform; **`data-platform/`** = the *services* |
| W2 | **`connector-platform/` at top level** | Reads like a peer of Platform Foundation; it's an **ingestion** capability | Move under **`data-platform/connector-platform/`** |
| W3 | **`first-party-data/`** separate from data-platform | Tracking SDKs orphaned from the ingestion org | Fold into **`data-platform/tracking/`** (browser/react/nextjs/server/mobile SDKs) |
| W4 | **Shared code split 3 ways** (`libs/`, `shared-platform/`, `py-libs/`) | Ambiguous "where does this go", duplicate primitives | Consolidate to **`shared/`** (TS) + **`shared/python/`** (uv) — one home, language-namespaced where unavoidable |
| W5 | **No first-class** `schema-registry`, `identity-resolution`, `data-quality`, `reconciliation`, `signal-detection` | These are core CDP/data-quality capabilities buried in `event-processing`/`batch` | Promote each to a **named data-platform service** |
| W6 | **Streaming not expanded** (kafka/flink/spark) | Topics/jobs/backfills undefined; rebuild story unclear | Full **`streaming/{kafka,flink,spark}`** with topics, schemas, producers, consumers, jobs, backfills |
| W7 | **Observability buried in deploy** | It's a cross-cutting, platform-owned product, not a deploy artifact | Promote to top-level **`observability/`** |
| W8 | Naming: `platform-foundation`, `infrastructure`, `deploy`, `sdks` | Inconsistent with the approved ownership names | → **`platform/`, `infra/`, `deployment/`, `sdk/`** |
| W9 | Environment ladder incomplete (`deploy/local` + envs) | No dev/qa/staging/preprod/prod separation | Full **`deployment/{local,dev,qa,staging,preprod,prod}`** |
| W10 | `config/` at root, ambiguous | Dumping ground | Fold into `shared/config` + `tools/` |

### The refinement principle
**Two things named "data" must be separated by *what they own*:**
- **`data/`** owns the *physical data layer* — schemas, migrations, indexes, views, graph models, retention. It is a **product of the Data Platform org** but a **dependency of every service**. Changes here are reviewed by Data Platform + the owning service.
- **`data-platform/`** owns the *runtime services* that move/shape data (ingestion, streaming, identity, quality…).

This separation is the single biggest upgrade in v2: it lets schema governance and service deployment evolve independently.

---

## Part 1 — Repository strategy & principles

**Hybrid monorepo.** One repo, many independently-deployable services. Turborepo builds the dependency graph and caches;
pnpm workspaces resolve TS packages; uv resolves Python. CI builds/tests/deploys **only affected** projects.

```
package managers:  pnpm (TS/JS)  ·  uv (Python)        orchestration: turborepo
boundaries:        8 platforms (top-level ownership)   contracts: single source of truth → codegen
deploy unit:       one service = one deployable (ECR image / Helm release / EAS build)
```

**Principles encoded by the structure**
1. **Ownership is the top-level axis.** A new engineer maps folder → owning pod in one hop.
2. **Contracts before code.** `contracts/` is the only cross-service coupling; everything else is generated from it.
3. **The data layer is a governed dependency**, not a service-local detail (`data/`).
4. **One service = one deployable**, with the same internal shape (template) regardless of platform.
5. **Event-driven by default.** Services communicate via contract-versioned events (Kafka) + commands; sync calls only at the edge (BFF).
6. **Multi-region by construction.** `infra/` pins residency (IN/AE/GCC); nothing in app code assumes a region.
7. **The five gating invariants** are structural (e.g. only `commerce-intelligence/metrics-engine` produces numbers).

---

## Part 2 — The 8 platforms as ownership boundaries

| Platform | Folder | Owns | Primary stack | Pod |
|---|---|---|---|---|
| Product Applications | `apps/` | Founder/admin/onboarding/AI-assistant UIs, mobile | Next.js, RN/Expo | Frontend + Mobile |
| Platform Foundation | `platform/` | Identity, tenancy, org/brand, RBAC, governance, billing | NestJS | Platform-Core |
| Data Platform | `data-platform/` | Tracking, ingestion, streaming, identity-res, quality, connectors | NestJS + Python + Flink/Spark | Data Platform |
| Commerce Intelligence | `commerce-intelligence/` | Metrics engine, ledger, attribution, dashboards, brief | NestJS (+ Python models) | Commerce |
| Customer Intelligence | `customer-intelligence/` | Customer360, segmentation, journeys, activation, loyalty | NestJS + Python | CDP |
| Agent Platform | `agent-platform/` | Agent runtime, guardrails, approvals, execution, reversal, learning | Python (LangGraph) + Temporal | Agents |
| AI Platform | `ai-platform/` | Feature store, model/eval registry, serving, LLM gateway, memory | Python (FastAPI/BentoML) | AI/ML |
| Infrastructure | `infra/` + `deployment/` + `observability/` | IaC, clusters, networking, security, o11y | Terraform, CDK, Helm, Argo | Platform/DevOps |

**Cross-cutting (consumed by all, owned by a platform):** `contracts/` (Arch council), `shared/` (Platform-Core),
`sdk/` (Data Platform — public-facing), `data/` (Data Platform), `docs/`, `tools/`, `scripts/`.

---

## Part 3 — Final root structure (annotated)

```
brain/
├── apps/                    # ① Product Applications        — Frontend + Mobile pods
├── platform/                # ② Platform Foundation (NestJS) — Platform-Core pod
├── data-platform/           # ③ Data Platform services       — Data Platform pod
│   ├── tracking/            #     first-party SDK platform
│   ├── connector-platform/  #     100+ source connectors + framework
│   └── streaming/           #     kafka / flink / spark
├── commerce-intelligence/   # ④ Commerce Intelligence (NestJS+Py) — Commerce pod
├── customer-intelligence/   # ⑤ Customer Intelligence / CDP        — CDP pod
├── agent-platform/          # ⑥ Agent Platform (Python+Temporal)   — Agents pod
├── ai-platform/             # ⑦ AI/ML Platform (Python)            — AI pod
│
├── shared/                  # cross-cutting libraries (TS + python/) — Platform-Core
├── contracts/               # SOURCE OF TRUTH: api/events/commands   — Arch council
├── sdk/                     # public/customer SDKs (generated+hand)  — Data Platform
├── data/                    # ⑧a physical data LAYER (schemas/migr)  — Data Platform
│
├── infra/                   # ⑧b IaC: terraform/eks/networking/sec   — Platform/DevOps
├── deployment/              # ⑧c per-env deploy (local→prod)         — Platform/DevOps
├── observability/           # ⑧d otel/prom/grafana/loki/tempo        — Platform/DevOps
│
├── docs/                    # architecture, ADRs, runbooks, governance
├── tools/                   # generators, codegen, lint rules, CLIs
├── scripts/                 # repo-wide automation
├── turbo.json  pnpm-workspace.yaml  pyproject.toml  CODEOWNERS
```

> **Naming note:** I keep `platform/` (not `platform-foundation/`), `infra/`, `deployment/`, `sdk/`, `data/` per the
> approved model. The justified improvements over a literal reading: (a) `connector-platform/` and `tracking/` live
> **inside** `data-platform/` (they are ingestion); (b) a dedicated top-level **`data/`** for the physical layer; (c) a
> single **`shared/`** with a `python/` sub-tree instead of a separate `py-libs/`.

---

## Part 4 — Product Applications (`apps/`)

Next.js 16 / React 19 / TS / Tailwind / shadcn / TanStack Query · React Native + Expo. `shared-ui/` is the design system.

```
apps/
├── founder-console/         # the primary web dashboard (Next.js)
├── admin-console/           # internal ops/superadmin (Next.js)
├── onboarding-portal/       # signup → onboarding (can fold into founder-console or stand alone)
├── ai-assistant-ui/         # conversational surface (chat/agent) — can embed in console
├── mobile-founder/          # React Native + Expo — Morning Brief is the hero surface
├── mobile-operator/         # RN + Expo — ops/warehouse/approvals on the go
└── shared-ui/               # design system: tokens, primitives, charts, metric registry, formatters
```

**Standard web app shape** (every Next.js app):
```
founder-console/
├── app/                     # routes (App Router): (protected)/w/[slug]/…, auth/…, api/…(route handlers)
├── features/                # one folder per surface (thin pages → feature modules)
├── components/              # ui/ (shadcn), layout/, charts/, data-table/, metric/, integrations/
├── lib/                     # api/ (client+server fetch seam), auth/ (Auth.js↔Keycloak), metrics/ (registry),
│                            #   format/ (currency/locale), features/ (flag+role gating), integrations.ts
├── e2e/                     # Playwright (+ global-setup tenancy reset)
├── public/  styles/  middleware (proxy.ts)  next.config  Dockerfile  .env.example
```
**Standard mobile app shape** (every Expo app):
```
mobile-founder/
├── app/                     # expo-router screens
├── features/                # morning-brief/, approvals/, metrics/
├── components/  lib/ (api, auth, push)  assets/  eas.json  app.config.ts
```
**`shared-ui/`** is a pnpm package (`@brain/ui`) consumed by every app: design tokens, primitives, the **metric
registry** (TS↔Python parity tested), chart kit, currency-aware formatters, role/feature gates. **No app reinvents a primitive.**

---

## Part 5 — Platform Foundation (`platform/`) — NestJS, DDD/Hexagonal/CQRS

```
platform/
├── identity/        # auth, sessions, MFA, Keycloak integration
├── tenancy/         # tenant context, RLS enforcement, residency pinning
├── organization/    # org lifecycle, billing basis
├── brand/           # brand = THE workspace key; emits brand_id everywhere
├── membership/      # user × org × brand × role
├── onboarding/      # single-shot onboarding orchestration
├── rbac/            # roles, permissions, policy decisions
├── governance/      # kill-switches, change control, gating policy
├── audit/           # append-only audit log (system of record)
├── notification/    # severity-routed alerts (in-product/email/mobile)
├── configuration/   # feature flags, brand config, remote config
├── billing/         # GMV-percent / enterprise billing
├── api-gateway-bff/ # the single sync edge: verifies Keycloak JWTs, serves the console read-model,
│                    #   exposes approved-action APIs. NOT a domain service.
└── _template/       # cookiecutter NestJS service
```

### Standard NestJS service template (every `platform/*`, `commerce-*`, `customer-*`, NestJS connector)
```
<service>/
├── src/
│   ├── api/             # inbound adapters: http/ (controllers), grpc/, consumers/ (Kafka), graphql/
│   ├── application/     # use-cases: commands/ (CQRS write), queries/ (read), dto/, ports/ (interfaces)
│   ├── domain/          # PURE: model/ (entities, aggregates, VOs), events/ (domain events), services/, errors/
│   ├── infrastructure/  # outbound adapters: clients/ (other services), messaging/ (producers), config/
│   ├── persistence/     # repositories, pg/CH queries, mappers (domain ↔ row). Schemas live in /data, not here.
│   ├── contracts/       # generated types from /contracts (codegen output; never hand-edited)
│   ├── config/          # env schema (zod), DI providers
│   └── main.ts          # bootstrap (rawBody for webhooks, CORS, OTEL)
├── test/                # unit/ integration/ contract/ e2e/  (vitest/jest)
├── migrations/          # ← service-local *references* /data migrations; physical DDL lives in /data
├── chart/               # Helm chart (one deployable)
├── Dockerfile  package.json  tsconfig.json  project.json (turbo)
```
**Why one template for all:** DDD keeps the **domain** pure and framework-free; **Hexagonal** isolates I/O behind
ports (api/infrastructure are swappable adapters); **CQRS** splits write (commands) from read (queries) so the
read-model can scale independently and the metric engine stays the only number-producer; **Clean Architecture**
dependency rule = `api → application → domain ← infrastructure` (domain depends on nothing). The shape is identical
across 100 services → an engineer is productive in any service on day one.

---

## Part 6 — Data Platform (`data-platform/`) — its own engineering org

```
data-platform/
├── tracking/            # first-party SDK platform (see §6.1)
├── ingestion/           # raw event intake (write-key auth) → raw topic; webhook receivers
├── schema-registry/     # event schema registry (Avro/JSON-Schema), compatibility checks, codegen feeds /contracts
├── event-processing/    # normalize/enrich raw → normalized events (Flink/consumers)
├── identity-resolution/ # stitch anonymous↔known; device/customer graph (Neo4j)
├── attribution/         # touchpoint capture + journey stitching (RAW signal; modeling is commerce/attribution-engine)
├── signal-detection/    # anomaly/trend/threshold signals → agent + notification triggers
├── data-quality/        # freshness/completeness checks; connector-health; withholds high-risk recs when stale
├── reconciliation/      # cross-source truth reconciliation (orders vs payments vs ledger)
├── streaming/           # kafka / flink / spark (see §6.3)
├── connector-platform/  # 100+ source connectors + framework (see §6.2)
└── _template/           # cookiecutter (NestJS for control-plane svcs; Python for processors)
```

### 6.1 Tracking SDK platform — `data-platform/tracking/`
```
tracking/
├── browser-sdk/   # vanilla JS, <script> snippet, consent-aware, batched
├── react-sdk/     # hooks + provider over browser-sdk
├── nextjs-sdk/    # app-router + server actions; first-party proxy route
├── server-sdk/    # Node/server events (write-key)
├── mobile-sdk/    # RN/Expo events
└── _core/         # shared: write-key auth, envelope, batching, retry, schema-version
```
Each SDK is a published package (`@brain/track-*`). The **ingestion** service (`/ingestion`) is the receiving end:
`POST /track` (write-key auth) → `brain.raw_events` → Kafka.

### 6.2 Connector Platform — `data-platform/connector-platform/`
```
connector-platform/
├── _kit/            # the framework EVERY connector composes (write once, reuse 100×)
│   ├── core/        #   contract (manifest + hooks), oauth (signed state), webhook-engine (verify+dedupe),
│   │                #   sync-engine (cursors), rate-limiter, retry (backoff+breaker), dlq, health, writeback
├── registry/        # connector catalog (manifests: auth kind, ingest lanes, streams) + per-brand connection state
├── shopify/  meta/  google/  tiktok/  stripe/  razorpay/  shiprocket/  whatsapp/  hubspot/  salesforce/
│   zendesk/  woocommerce/  marketplaces/        # ONE independently-deployable connector each
└── _template/       # cookiecutter for connector #N
```
**Common connector framework — the contract** (`_kit/core`): a connector declares a **manifest** (provider, category,
tier, auth ∈ {oauth2,apikey,basic}, ingest ∈ {push,pull,owned}, streams, backfill) and implements only the **hooks**
its provider supports:
```
connect:  authorizeUrl() / exchangeCode()        — OAuth2 (→ token to vault)
          validateCredentials()                  — apikey/basic
push:     registerWebhooks() · verifyWebhook() · mapWebhook() → normalized records   (Shopify/Woo/payments)
pull:     refresh() · pull(stream, cursor, token) → records + nextCursor              (Meta async Insights, Google SearchStream)
```
The kit drives scheduling, rate-limits, retries, DLQ, health, and publishing. **Lifecycle is enforced:
connect → vaulted token → ingest.** Every connector emits the **same normalized record** (OrderRecord, PaymentRecord,
AdSpendRecord) to Kafka, so downstream consumes **streams, not vendors**. **Per-connector deployable** (P2+) so one
provider's outage/rate-limit is contained to its pod.

### 6.3 Streaming — `data-platform/streaming/`
```
streaming/
├── kafka/
│   ├── topics/         # topic definitions (name, partitions, retention, keying):
│   │                   #   brain.integration.webhooks (push) · .pull (poll) · .events (control)
│   │                   #   brain.raw_events · brain.normalized_events · brain.customer_events
│   ├── schemas/        # Avro/JSON-Schema per topic (governed by schema-registry; codegen → /contracts)
│   ├── producers/      # shared producer config (idempotent, keyed)
│   ├── consumers/      # consumer groups + offset/commit policy
│   └── connect/        # (optional) EventBridge/PubSub bridges for high-volume trusted delivery
├── flink/
│   ├── jobs/           # streaming jobs: normalize, identity-stitch, sessionize, signal-detect, dedupe
│   ├── state/          # checkpoint/savepoint config; RocksDB tuning
│   └── connectors/     # Kafka↔ClickHouse/Iceberg sinks
└── spark/
    ├── jobs/           # batch: daily aggregates, attribution model runs, cohort builds
    ├── backfills/      # historical replays (Shopify Bulk, ad-account history)
    └── rebuilds/       # full fact rebuilds from Iceberg (source of truth) → ClickHouse
```
**Ingestion patterns** (validated against the category): **push** (webhooks) for storefronts/payments/logistics;
**pull** (scheduled polling) for ad platforms (Meta async Insights, Google SearchStream — they don't push metrics);
**owned** (first-party SDK). All three land on Kafka → **ClickHouse Kafka-Engine + Materialized View → MergeTree** for
the hot path; **Iceberg** is the immutable system-of-record enabling **rebuilds**.

---

## Part 7 — Commerce Intelligence (`commerce-intelligence/`)
```
commerce-intelligence/
├── metrics-engine/        # THE ONLY service that produces numbers. Most-tested. TS↔Py metric parity.
├── revenue-ledger/        # double-entry-style revenue/cost ledger (integer minor units)
├── attribution-engine/    # applies models to stitched journeys (data-platform/attribution) → credited revenue
├── analytics-engine/      # cohorts, LTV, P&L, waterfall computations
├── dashboard-serving/     # read-model serving for the console (CQRS read side)
├── executive-analytics/   # board/exec rollups
├── morning-brief/         # the daily brief (mobile hero) — composes metrics + signals + next action
├── decision-log/          # append-only log of recommendations/decisions (auditability)
└── _template/
```
**Ownership boundary:** Commerce pod owns the *meaning of money*. **Invariant:** only `metrics-engine` emits a number;
every other surface (dashboards, brief, exec) **reads** from it. `attribution-engine` consumes the *raw* stitched
journey from `data-platform/attribution` + identity-resolution; it never re-stitches.

---

## Part 8 — Customer Intelligence / CDP (`customer-intelligence/`)
```
customer-intelligence/
├── customer360/        # unified profile (identity-resolution output + commerce + support)
├── segmentation/       # rule + ML segments
├── audience-builder/   # composable audiences → activation
├── journey-analytics/  # path/funnel/lifecycle analytics
├── customer-health/    # churn/health scoring
├── activation/         # push audiences to channels (ads, email/SMS, WhatsApp) — write-path via connectors
├── loyalty/            # loyalty/retention programs
└── _template/
```
**Boundary:** CDP owns the *customer as an entity*. Reads identity from `data-platform/identity-resolution`; never
owns money (that's Commerce). Support/Inbox is a CDP-adjacent, Operations-owned context (lives here or in a sibling).

---

## Part 9 — Agent Platform (`agent-platform/`) — Python + LangGraph + Temporal
```
agent-platform/
├── agent-runtime/          # LangGraph graphs; the 15 product agents
├── recommendation-engine/  # generates candidate actions (reads metrics + signals + memory)
├── guardrails/             # policy/risk checks BEFORE any action (hard gates: calling-hours, consent, DLT/NCPR)
├── approval-engine/        # human-in-the-loop approvals (Temporal signals) for high-risk actions
├── execution-engine/       # executes approved actions via connector writeback / Action APIs
├── reversal-engine/        # compensation/rollback workflows (Temporal SAGA)
├── outcome-tracking/       # measures the result of each action (closes the loop)
├── learning-loop/          # feeds outcomes back into recommendations (offline + online)
├── memory-manager/         # agent memory (short/long term) over /ai-platform memory + pgvector
└── _template/              # Python agent service
```
**Pattern:** `recommend → guardrails → (approve) → execute → track → learn`, orchestrated by **Temporal** for
durability + **compensation** (every execute has a registered reversal). Human approvals are Temporal signals.
Money-moving paths require Security co-sign (structural CODEOWNERS rule).

---

## Part 10 — AI Platform (`ai-platform/`) — Python (FastAPI/BentoML)
```
ai-platform/
├── feature-store/        # Feast: online (Redis) + offline (Iceberg) features; TS↔Py parity with metric registry
├── model-registry/       # MLflow: model versions, stages, lineage
├── feature-engineering/  # feature pipelines (Spark/Python)
├── training/             # training jobs, hyperparam, schedules
├── serving/              # BentoML/FastAPI inference services (one deployable per model family)
├── evaluation/           # Ragas (RAG), offline eval, model-calibration golden tests
├── memory/               # vector memory (pgvector/OpenSearch) for agents + assistant
├── llm-gateway/          # the ONLY egress to LLM providers — routing, cost-control, caching, redaction, LangSmith
├── experimentation/      # A/B + offline experiments, feature flags for models
└── _template/            # standard Python AI service
```
### Standard Python AI service template (every `ai-platform/*`, agent service, Python data processor)
```
<service>/
├── src/<pkg>/
│   ├── api/              # FastAPI routers (or BentoML service); request/response models (pydantic)
│   ├── application/      # use-cases / orchestration
│   ├── domain/           # pure logic (no framework, no I/O)
│   ├── infrastructure/   # clients (model-registry, feature-store, llm-gateway), messaging
│   ├── adapters/         # persistence, vector store
│   ├── config/           # pydantic-settings env schema
│   └── main.py
├── tests/                # pytest: unit / integration / eval
├── pyproject.toml        # uv-managed; depends on shared/python packages
├── Dockerfile  bentofile.yaml(optional)  chart/
```
**LLM Gateway is the single chokepoint** for all model egress (cost-routing champion): no service calls OpenAI/Anthropic
directly. Evaluation (`evaluation/`) gates model promotion via golden tests (calibration, Ragas) in CI.

---

## Part 11 — Shared libraries (`shared/`)
```
shared/
├── auth/         rbac/         observability/   security/      # cross-cutting concerns
├── kafka/        temporal/     cache/           events/        # infra clients (typed)
├── validation/   exceptions/   logging/         testing/  utilities/
└── python/       # the uv-managed equivalents for Python services (py-libs folded here):
    ├── auth/  observability/  events/  kafka/  testing/  utilities/
```
**Ownership:** Platform-Core owns `shared/`. **Usage rule:** a primitive used by **≥2 platforms** belongs in `shared/`;
a primitive used by one service stays local. **No business logic in `shared/`** — only cross-cutting mechanics.
Changes are widely-blast-radius → require Platform-Core review (CODEOWNERS) + a passing affected-build.

---

## Part 12 — Contracts (`contracts/`) — the source of truth
```
contracts/
├── api/         # service API contracts (request/response)
├── events/      # Kafka event schemas (Avro/JSON-Schema) — the event catalog
├── commands/    # CQRS command schemas
├── protobuf/    # gRPC service definitions
├── openapi/     # REST specs (BFF + public)
├── graphql/     # GraphQL SDL (if/where used)
└── schemas/     # shared value-object schemas (money, ids, region…)
```
**Governance & versioning:**
- **Single source of truth.** Services never share types directly; they **codegen** from `contracts/` into
  `<service>/src/contracts` (build step; never hand-edited).
- **Backward-compatible by default.** Additive changes only within a major; breaking changes require a new version
  (`v1→v2`) + a deprecation window. Event schemas run a **compatibility check** (schema-registry) in CI.
- **Owned by the Architecture council** (CODEOWNERS on `contracts/**`) — cross-platform sign-off because a contract
  change can ripple to 100 services.
- **Consumer-driven contract tests** in CI verify producer↔consumer compatibility before merge.

---

## Part 13 — SDK (`sdk/`) — public/customer-facing
```
sdk/
├── javascript/  typescript/  react/  react-native/  node/  server/
```
Distinct from `data-platform/tracking/` (internal first-party SDKs) and `shared/` (internal libs): `sdk/` is what
**customers/partners** consume. Generated from `contracts/openapi` + hand-written ergonomics. Versioned + published to
a registry; semver; changelog per release. Owned by Data Platform (DX).

---

## Part 14 — Data layer (`data/`) — the physical stores (the W1 upgrade)
```
data/
├── postgres/     # per-service schemas (UUID v7, RLS, integer-minor money), migrations, indexes, views, seed
├── clickhouse/   # analytical models (customer_events, fact_spend, orders, payments…), Kafka-engine + MVs
├── neo4j/        # identity/customer graph models, constraints
├── redis/        # key conventions, TTL policies (cache, sessions, rate-limits)
├── opensearch/   # index templates, mappings (search, logs)
├── pgvector/     # vector schemas (agent/assistant memory)
├── iceberg/      # table layout — the immutable system-of-record enabling rebuilds
└── s3-layout/    # bucket/prefix layout, lifecycle, residency
```
Each store has: `migrations/` (versioned, phase-gated `schema/phaseN`), `schemas/` (canonical DDL), `indexes/`,
`views/`, `retention/` (TTL/partition-drop), `models/` (graph/vector). **Governance:** a migration touching a
service's schema needs **Data Platform + owning-service** review. Retention/residency policies are reviewed by
Security + Compliance (DPDP/PDPL).

---

## Part 15 — Infrastructure (`infra/`)
```
infra/
├── terraform/    # root modules + per-region stacks (account, VPC, EKS, MSK, ClickHouse, ElastiCache, OpenSearch, S3)
├── eks/          # cluster config, node groups, addons, autoscaling
├── networking/   # VPC, subnets, peering, private link, ingress
├── security/     # IAM, KMS, secrets (Secrets Manager), WAF, network policies
├── keycloak/     # realm config, clients, IdP brokering, service accounts
└── argocd/       # GitOps app-of-apps, sync policies, projects per platform
```
**Multi-region:** one stack per region — **`in-mumbai`**, **`ae-dubai`**, **`gcc-*`** (Bahrain/Oman/Qatar/Kuwait as
they light up). Residency pinned at the storage layer; a brand's `region` (IN/AE/SA/BH/OM/QA/KW) routes its data to
the in-region stack. Nothing in service code assumes a region.

## Part 16 — Deployment (`deployment/`)
```
deployment/
├── local/    # ONE-COMMAND docker compose: kafka(redpanda), postgres, clickhouse, redis, opensearch,
│             #   keycloak, temporal, neo4j (+ consoles). `make up`.
├── dev/  qa/  staging/  preprod/  prod/   # per-env Helm values + Argo apps; promotion ladder
```
**Promotion:** local → dev → qa → staging → preprod → prod, gated by CI (tests, contract checks, security scan) +
the Stage-6 final review + Founder gate for high-stakes. **48h monitor + auto-rollback** on prod (Platform/DevOps).

## Part 17 — Observability (`observability/`)
```
observability/
├── otel/         # collector config, instrumentation conventions (trace IDs end-to-end)
├── prometheus/   # scrape configs, recording rules
├── grafana/      # provisioning, datasources
├── loki/         # log pipeline   tempo/  # traces
├── dashboards/   # per-platform dashboards (golden signals + business KPIs)
└── alerts/       # alert rules (SLO burn, sync lag, DLQ depth, throttle utilization, model drift)
```
**Trace IDs must appear end-to-end** (a QA veto). Per-connector: sync lag, error rate, DLQ depth, throttle %.

## Part 18 — Documentation (`docs/`)
```
docs/
├── architecture/   adr/        api/          runbooks/      onboarding/
├── security/       compliance/ ai-governance/ data-governance/ disaster-recovery/
```
ADRs are immutable, numbered. `ai-governance/` covers model approval, eval gates, LLM cost/redaction; `data-governance/`
covers residency, retention, PII, DPDP/PDPL/DLT/NCPR. `runbooks/` per service + DR drills.

---

## Part 19 — Ownership boundaries

**Team ownership** (CODEOWNERS top-level → pod):
```
/apps/                     @frontend @mobile
/platform/                 @platform-core
/data-platform/            @data-platform
/commerce-intelligence/    @commerce
/customer-intelligence/    @cdp
/agent-platform/           @agents
/ai-platform/              @ai
/shared/ /contracts/       @platform-core @architecture     # contracts: architecture council co-owns
/data/                     @data-platform                    # + owning-service review on its schema
/infra/ /deployment/ /observability/   @platform-devops
# Money-moving paths (billing, execution-engine, revenue-ledger) require @security co-sign
```
**Service ownership:** one service = one folder = one team = one on-call rotation = one deployable. A service owns its
domain, its read-model, its tests, its runbook, its dashboard, its alerts. It owns its **schema slice** in `/data`
(co-reviewed). It does **not** reach into another service's persistence — only its contract.

**Deployment ownership:** each service ships its own `chart/` + `Dockerfile`; Argo deploys it independently. The
Platform/DevOps pod owns the *platform* (clusters, pipelines, promotion, rollback); each pod owns *its services'*
deploys within that platform. Connectors/agents are **per-service deployables** so blast radius is contained.

---

## Part 20 — Phase 1 → Phase 6 evolution (structure is fixed; services land per phase)

The **folders are created now**; services fill them by phase. Lean-core early, split as load/ownership justifies.

| Phase | Theme | Lands |
|---|---|---|
| **P1** | Lean core, single ingestion path | `platform/*` (identity→billing), `data-platform/{ingestion,tracking,connector-platform(shopify/meta/google/stripe/razorpay/shiprocket/whatsapp)}`, `data/{postgres,clickhouse}`, `commerce/metrics-engine`+dashboard-serving, `apps/founder-console`+`mobile-founder`, `deployment/local` |
| **P2** | Split + scale ingestion | per-connector deployables, `data-platform/{streaming(flink),identity-resolution,data-quality}`, `customer-intelligence/customer360`, qa/staging envs |
| **P3** | Intelligence | `commerce/{attribution-engine,analytics-engine,morning-brief,decision-log}`, `ai-platform/{feature-store,model-registry,serving,llm-gateway}`, `data-platform/signal-detection` |
| **P4** | Agentic | `agent-platform/*` (runtime→reversal→learning), `ai-platform/{evaluation,memory,experimentation}`, approvals + compensation |
| **P5** | Activation + writeback | `customer-intelligence/{segmentation,audience-builder,activation,loyalty}`, connector **writeback**, execution-engine |
| **P6** | Enterprise + GCC + custom | `connector-platform/custom-integration-framework`, marketplaces, GCC regions in `infra/`, `executive-analytics`, preprod/prod hardening |

**Rule:** a new phase **never reshapes the top level** — it only fills folders. This is what makes 5–10 year evolution safe.

---

## Part 21 — Adding a new service (the golden path)

1. **Contract first.** Add/extend schemas in `contracts/{events,api,commands}`; run compatibility check.
2. **Scaffold from the template.** `pnpm gen:service --platform=<p> --name=<svc>` (TS) or `uv run gen-py-service`
   (Python) → copies `_template/`, wires `project.json` (turbo), `chart/`, CODEOWNERS entry.
3. **Own a schema slice.** Add its migrations under `data/<store>/migrations` (phase-gated); Data Platform co-reviews.
4. **Compose, don't reinvent.** Use `shared/` (or `shared/python/`) for auth/o11y/kafka/temporal; connectors compose
   `connector-platform/_kit`; agents compose `agent-platform` + `ai-platform`.
5. **Wire events, not calls.** Produce/consume contract-versioned topics; sync calls only via the BFF edge.
6. **Tests + o11y + runbook.** unit/integration/contract/e2e; a dashboard in `observability/dashboards`; a runbook in
   `docs/runbooks`; trace IDs end-to-end.
7. **Ship independently.** Its own image + Helm release; Argo deploys only the affected service.

## Part 22 — Governance rules (the guardrails that keep 100 services coherent)
1. **Top level is immutable** without an ADR + Architecture-council approval. Phases fill, never reshape.
2. **No language/tier folders.** Ownership is the axis. (`apps/` is the only UI grouping, and it's a *platform*.)
3. **Contracts are the only cross-service coupling.** No importing another service's `src`. Codegen only.
4. **The data layer (`/data`) is governed.** Schema changes = Data Platform + owning service; retention/residency = + Compliance.
5. **One number-producer.** Only `commerce-intelligence/metrics-engine` emits metrics. TS↔Py parity is CI-gated.
6. **One LLM egress.** Only `ai-platform/llm-gateway` calls model providers.
7. **One service = one deployable = one owner = one on-call.** No shared deployables.
8. **Money-moving + irreversible paths require Security co-sign** and a registered compensation/reversal.
9. **Affected-only CI.** Turborepo builds/tests/deploys only what changed; contract + metric-parity + isolation gates must pass.
10. **Trace IDs end-to-end** or QA vetoes the release.

---

## Part 23 — Migration from the current on-disk layout (delta)

**Executed** on branch `chore/repo-structure-migration` (see [Brain_Repository_Migration_Plan.md](./Brain_Repository_Migration_Plan.md)). Final actions as shipped:

| Current | →  v2 | Action |
|---|---|---|
| `platform-foundation/` | `platform/` | rename ✅ |
| `connector-platform/` (root) | `data-platform/connector-platform/` | move ✅ |
| `first-party-data/` | `data-platform/first-party-data/` | move whole (D1 — kept cohesive; broader than "tracking") ✅ |
| `data-platform/{stores,warehouse}` (schemas) | `data/{stores,warehouse}` | extract physical layer ✅ |
| `libs/` + `py-libs/` | `shared/ts/` + `shared/python/` | consolidate ✅ |
| `shared-platform/*` (skeletons) | owning platforms (D2 — services, not libs: llm-gateway→ai-platform, region/notification/search→platform, aggregation-zone→data-platform) | dissolve ✅ |
| `sdks/` | `sdk/` | rename ✅ |
| `infrastructure/` | `infra/` | rename ✅ |
| `deploy/` | `deployment/` | rename ✅ |
| `infrastructure/observability/` | `observability/` | promote to top level ✅ |
| `config/` | `shared/config/` | fold ✅ |
| `data-platform/{batch,replay}` | (left in place — D3, cosmetic on skeletons) | deferred |

These were **moves/renames + CODEOWNERS updates**, not rewrites. Verified: `pnpm install` relinks clean,
connector-kit + all 5 connectors + registry build, `api-gateway-bff` `nest build` succeeds, kit + BFF unit tests pass.
The canonical per-service internal layout is specified in [nestjs-service-template.md](./nestjs-service-template.md).

---

## Appendix — the five gating invariants, structurally enforced
1. **Metric integrity** → only `commerce-intelligence/metrics-engine` produces numbers (CODEOWNERS + CI parity).
2. **Money safety** → `billing`/`revenue-ledger`/`execution-engine` require `@security`; integer-minor money in `/data`.
3. **Reversibility** → `agent-platform/reversal-engine` registers a compensation for every executed action (Temporal SAGA).
4. **Residency/compliance** → `/data` retention + `infra/` regions + `docs/{data,ai}-governance` (DPDP/PDPL/DLT/NCPR).
5. **Observability** → `observability/` + end-to-end trace IDs (QA veto).
```
