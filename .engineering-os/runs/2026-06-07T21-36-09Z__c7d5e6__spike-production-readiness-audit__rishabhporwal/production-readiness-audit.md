# Brain — Production-Readiness Audit (Engineering OS)

**req_id:** `spike-production-readiness-audit` · **lane:** high_stakes · **date:** 2026-06-07 ·
**panel:** Architecture, Backend/Code+SOLID, Database, Security, API/Events, QA/Testing, DevOps/SRE+Observability,
Performance/Stack, VP-Eng/BRD-compliance (9 independent persona auditors, read-only, evidence-based).

> **Process note (meta-finding):** the Engineering-OS **Product Canon is absent** from the repo (no
> `STACK.md`, `TRIGGER-SURFACES.md`, `COMPLIANCE.md`, `INVARIANTS.md`, `METRICS.md`). The OS ran against
> generic trigger surfaces. Bootstrapping the Canon is a prerequisite for the OS to enforce product-specific
> gates. *(Severity: Medium — process readiness.)*

---

## 1. Executive Summary

Brain today is a **well-engineered platform-foundation slice wrapped in a large empty scaffold of the
target architecture.** The parts that are built — multi-tenant isolation, RBAC, invite lifecycle, Keycloak
auth, and the ClickHouse ingest pipeline — are genuinely strong, tested, and in several places exemplary.
But **~95% of the approved service landscape is `.gitkeep` scaffolding**, the production deployment path
(**IaC, K8s, CI/CD, observability**) **does not exist**, and **only ~35–40% of the Blueprint's Phase-1
functional scope** is met. This is a **strong late-Phase-1 *foundation* / early data-platform prototype** —
**not** an enterprise-production-ready system.

**Verdict: 🔴 NO-GO for enterprise production.** The crown-jewel (tenant isolation) is real and the security
core is sound, so this is a *credible* foundation — but shipping to production is blocked by P0 data-isolation
gaps on the live analytics tables, zero production infrastructure/observability, live dev secrets, and a
near-empty test estate outside the foundation.

**Overall readiness score: 40 / 100.**

| Discipline | Score | One-line |
|---|---|---|
| Architecture & Structure | **38** | Strong foundations; ~95% of services are empty scaffolds; BFF is a monolith presented as microservices |
| Code Quality & SOLID | **71** | Clean micro-level code, zero `any`, good tenancy abstraction; no input-validation layer, a god-service, SQL-in-services |
| Database | **74** | Best-in-class RLS + indexing + money modeling; **P0: live CH tables lack row policies**; RLS NULLIF inconsistency; no partitioning/retention execution |
| Security | **71** | 4-layer isolation is real & gated; live secrets to rotate, superuser DB role, wildcard CORS, no rate limiting, MFA unenforced |
| API & Events | **38** | No versioning/pagination/rate-limit/validation; event_platform schema unused; tracking bypasses Kafka |
| Testing | **31** | ~9 real test files for ~813 sources; excellent isolation/invite suites; no contract/load/security tests; 9/11 CI workflows are stubs |
| DevOps / Infra / Observability | **24** | Excellent local stack; **zero** IaC/K8s/ArgoCD/metrics/tracing/alerting; CI is a façade |
| Performance & Scalability | **41** | Strong ingest pipeline; synchronous `FINAL` ClickHouse on read path, **no Redis/CQRS read model**, fire-and-forget Kafka |
| BRD / Phase-1 Compliance | **38** | Foundation ~80% done; tracking MVP, identity-resolution absent, 5/7 connectors stubbed, derived-margin leak on dashboards |
| *Maintainability* | **60** | Good where built; debt from duplication, god-service, weakened TS strictness, dead/stub code |
| *Operational Readiness* | **18** | Cannot deploy or operate in prod; logs-to-stdout only |

---

## 2. CTO Review

**Strategic read:** the team has correctly invested first in the hardest-to-retrofit, highest-blast-radius
concern — **structural multi-tenancy** — and done it properly (RLS + `SET LOCAL ROLE` + Layer-3 backstop +
release-gating isolation tests). That is the right instinct and the most expensive risk genuinely de-risked.
However, the repo **misrepresents maturity**: ~60–70 service directories scaffold the entire 6-phase target,
implying a system that doesn't exist. For a due-diligence reader this is a red flag — *documentation and
reality have diverged with no ADRs reconciling them.* Recommendation: **reframe honestly** (modular-monolith
Phase-1 with a foundation slice), delete or quarantine empty scaffolds, bootstrap the Product Canon, and
sequence the real Phase-1 data platform (tracking SDK, event pipeline, identity resolution, connectors)
before any enterprise-production conversation.

## 3. VP Engineering Review

Execution quality on the *built* surface is high; **breadth and operability** are the systemic gaps.
The single working backend (BFF, ~2.4k LOC) carries auth, onboarding, tracking, integrations, webhooks,
invites and dashboard reads in one process — fine for now, but it is the scaling unit, the SPOF, and the
blast radius. Phase-1 exit criteria (per Blueprint §2.22) are **not met**: no event pipeline, no customer
identity resolution, 2/7 connectors real, dashboards breach the no-derived-margin rule, and only the local
deployment mode exists. **Not a sellable Phase-1 milestone yet** (~35–40% of functional scope).

---

## 4. Architecture Review (score 38)

**Aligned?** Partially in design, largely not in build. **Built reality:** one NestJS BFF modular-monolith
+ real shared libs (`tenancy`, `authz`, `access-control`, connector-kit) + Next.js console. **Gap:** the
"9-service lean core" is unbuilt (13 `platform/*` dirs are `.gitkeep` + 1-line `main.ts`, **no package.json**
→ cannot compile/deploy); the event-driven backbone has **zero consumers** and a silent `NoopEventBus`
fallback; Flink/Temporal/Neo4j/Schema-Registry absent from code; duplicate service dirs
(`notification` + `notification-svc`); layout drift from Blueprint §2.16 with an unmanaged `legacy frontend/`.
**Good:** tenancy is real (not theatre); the connector kit + DDD template are high-quality; BFF code is clean.
**Top blockers:** (1) no system, only an edge; (2) event backbone non-functional; (3) docs vs reality diverged without ADRs.

## 5. Code Quality & SOLID Review (score 71)

Above startup-median, below enterprise bar. **Strengths:** zero `any`, parameterized SQL throughout,
`unknown`-narrowing, fail-closed RBAC/tenancy, PII-redacting logger, clean connector contract. **Findings:**
no global `ValidationPipe`/DTO/Zod on a public multi-tenant gateway (High); `BffService` god-service (358 LOC
mixing CH analytics + PG onboarding + **hardcoded CM ratios 0.42/0.075/…**); hand-written SQL in services (no
repository pattern); `brand(slug)` + `markConnected`+audit+emit duplicated across 4–5 services; dead
`BffService.onboarding()`; 6 connector packages are 1-line stubs; **BFF tsconfig opts out of full `strict`**
(only `strictNullChecks`) — silently below the monorepo's own `tsconfig.base.json`.

## 6. Security Audit (score 71)

**The 4-layer tenant isolation is real and verified** (Layer 1 `withBrandContext` SET LOCAL ROLE + parameterized
GUC; Layer 2 RLS `FORCE` + `NULLIF` fail-closed; Layer 3 `assertBrandOwnership`; Layer 4 isolation test gate).
RBAC fail-closed + server-side + last-owner protection; parameterized SQL; Shopify HMAC + `timingSafeEqual` +
`*.myshopify.com` SSRF allowlist; signed/expiring OAuth state; PII-free logs.
**Severity-rated gaps:**

| Sev | Finding | Evidence |
|---|---|---|
| **High** | Live Google OAuth secret + Gmail app-password in plaintext on disk (gitignored, not committed — rotate anyway) | `deployment/local/.env:5,12` |
| **High** | BFF connects as DB **superuser** (`brain`); RLS relies solely on `SET LOCAL ROLE` (owner bypasses RLS) | `proxy.yml:32`, `rls.ts:6-12,37` |
| **High** | CORS reflects any origin with credentials | `main.ts:11` (`origin:true, credentials:true`) |
| **High** | No rate limiting / throttling on the BFF (login, token, refund, ingest) | no throttler in `platform/api-gateway-bff/src` |
| **Med** | MFA available but not enforced for Owner/Admin | `brain-realm.json` OTP policy, no required action |
| **Med** | Keycloak realm `sslRequired: none`; token `aud`/`azp` unchecked | `brain-realm.json:4`, `keycloak.guard.ts:19` |
| **Med** | Raw email stored as `display_name` (defeats pseudonymization) | `identity.service.ts:30` |
| **Med** | HMAC secret silently defaults to `'dev'` if env unset | `shopify.service.ts:59,66,86` |

Encryption-at-rest / per-tenant KMS keys are **unverifiable** — no Terraform in repo.

## 7. Database Audit (score 74)

**Strengths:** RLS genuinely enforces (`brain_app` non-super, `SET LOCAL ROLE`, FORCE on 38 tables, fail-closed);
phase-leakage guard real (refuses startup on phase>1 leakage); tenant-leading composite indexes + BRIN; money
as `bigint` minor units + `currency_code` FK; append-only audit/ledger; clean OLTP/OLAP split.
**Critical/High findings:**

| Sev | Finding | Evidence |
|---|---|---|
| **Critical** | Live integration CH tables `brain.orders` / `payments` / `ad_spend` (the ones actually fed by Kafka) have **NO row policy** — isolation relies only on the query gateway → P0 cross-tenant leak surface | `phase1_orders.sql`, `phase1_ad_spend.sql` (0 ROW POLICY) vs `phase1.sql:124-129` |
| **High** | RLS **NULLIF inconsistency**: 5 nullable-brand policies use `current_setting(...)::uuid` without `NULLIF` → on a pooled conn with reset GUC (`''`) they **throw** (fail-broken DoS, not fail-closed) | `30_tracking_event.sql:43,105`; `20_identity.sql:85`; `70_consent_compliance.sql:91`; `60_integration_shared.sql:118` |
| **High** | App connects as superuser (`rolbypassrls=t`) — one missing `withBrandContext` = total bypass | `pg_roles`, `infra.yml:11` |
| **Med** | No native partitioning on hot Aurora facts (orders/audit/consent) despite design claiming monthly RANGE; no retention execution (consent retention rows exist, nothing applies them) | `40_commerce.sql:45-47`, `70_consent_compliance.sql:76-93` |
| **Med** | `customer_events`/`raw_events` use plain `MergeTree` → replay duplicates; `brain.orders.total_price Decimal(18,2)` breaks minor-units invariant | `phase1.sql:28,60`; `phase1_orders.sql:15` |

## 8. API & Events Review (score 38)

No API **versioning** (all `/api/...`), no **pagination** (unbounded `members`/`integrations`/`detail`), no
**rate limiting**, no declarative **input validation**. The rich `event_platform` substrate (schema registry
mirror, offsets, DLQ, checkpoints) is **schema-only — no runtime uses it**; **tracking bypasses Kafka** and
writes straight to ClickHouse (violates "event-driven by default"); producer is **fire-and-forget** (no
idempotence/acks=all); mutating endpoints lack idempotency keys; `callback` returns provider `query` to a
redirect unvalidated (open-redirect surface). **Good:** inbound webhooks have real HMAC + DB-backed dedup;
event envelope is tenant-keyed (`brandId` partition key).

## 9. Testing Audit (score 31)

~9 real test files for ~813 sources; **all meaningful coverage in `api-gateway-bff`.** The isolation + invite
DB suites are **exemplary** (real RLS, negative controls, fail-closed). Everything else — every `platform/*`
service, all 5 connectors (which declare `"test"` but have **zero spec files** → vacuously green), 3/4
frontends, the entire data/streaming layer — has **no tests.** No coverage thresholds, **no contract/load/perf/
security tests**, **9/11 CI workflows are 1-line placeholders**, root `pnpm test` runs `test:contract` which no
package defines (no-op).

## 10. Infrastructure / DevOps / Observability Audit (score 24)

**Local stack is genuinely good** (one-command `make up`, healthchecks, leak-guard, canonical-mount schema).
Beyond the laptop: **0 `.tf` files, 0 `Chart.yaml`, 0 ArgoCD manifests** (23 Terraform module dirs + 54 service
`chart/` dirs all `.gitkeep`); 11/12 Dockerfiles are stubs; **9/11 CI workflows are comments**; observability is
5 `.gitkeep` stubs — **zero metrics, zero tracing, zero alerting, no log shipper.** Structured logging exists
(`@brain/observability` + interceptor, traceId/brandId, PII-safe) but goes to stdout only. The "six env
profiles" claim is unsubstantiated (only `local`). **The path from commit to running-in-AWS does not exist.**

## 11. Performance & Scalability Review (score 41)

**Strong:** the Kafka-engine → MV → ReplacingMergeTree ingest pipeline (tenant-first ORDER BY, partitioning).
**Risks:** BFF reads ClickHouse **synchronously, with `FINAL`, 6–11 serial queries per dashboard request, no
caching**; the architecture-mandated **Redis CQRS read-model / read buffer does not exist** (no Redis at all);
fire-and-forget Kafka + **no transactional outbox** (PG/CH can silently diverge on a broker blip); untuned PG
pool; runtime `JSONExtract` on hot reads. **Stack built vs declared: ~6 of ~22** technologies meaningfully
implemented (Postgres, ClickHouse, Keycloak, Next.js, partial Kafka/NestJS); Redis/Flink/Temporal/OpenSearch/
Neo4j/pgvector/Feast/MLflow/Spark absent (defensible Phase-1 sequencing, but §12.2 scalability claims depend on them).

## 12. BRD / Phase-1 Compliance (score 38)

**Implemented & tested:** auth (Keycloak-delegated), org/brand + switching, **invite-only lifecycle**, **fixed
11-role RBAC**, **four-layer tenant isolation**, social login. **Partial:** email verify/reset, MFA-ready,
onboarding (single-shot, **bypasses the activation gate**), tracking (single-event **MVP**, no SDK), unified
dashboards (real reads **but leak hardcoded derived margin — a Phase-1 violation**), local deploy mode.
**Missing:** event pipeline (registry/validation/dedup/replay/DLQ), **customer identity resolution + 360**,
5/7 connectors (Stripe/Razorpay/Shiprocket/WhatsApp = catalog rows only), connector-platform engines, true
7-step gated onboarding, **AWS/Terraform/ArgoCD mode**. Pillars 2–7 (margin engine/attribution/CDP/AI/agents)
are design-only (correctly deferred). **Scope drift:** the repo scaffolds all 6 phases (~60 empty dirs),
violating the "nine services, not fifty" lean-core discipline and misrepresenting maturity.

---

## 13. Technical Debt Report (top items)
1. No global input validation (DTO/Zod) on the public gateway. *(High)*
2. `BffService` god-service + hardcoded CM ratios in code, not the metric registry. *(High)*
3. No repository layer; SQL + `brand(slug)`/connect logic duplicated across 4–5 services. *(Med)*
4. BFF `tsconfig` weaker than monorepo `strict`. *(Med)*
5. Dead/stub code: `BffService.onboarding()`, 6 stub connectors, duplicate `notification*` dirs, `legacy frontend/`. *(Med)*
6. event_platform schema + 60 service scaffolds unused — false maturity surface. *(Med)*
7. `MergeTree` (not Replacing) on `customer_events`/`raw_events`; `Decimal` order amount. *(Med)*

## 14. Risk Register

| ID | Risk | Likelihood | Impact | Severity | Mitigation |
|---|---|---|---|---|---|
| R1 | Cross-tenant data leak via unprotected live CH tables (orders/payments/ad_spend) | Med | Critical | **Critical** | Add row policies; route reads through gateway that sets `brain_current_brand` |
| R2 | RLS fail-broken (NULLIF) DoS on pooled conns under load | Med | High | **High** | Wrap 5 policies in `NULLIF(...,'')` |
| R3 | Total RLS bypass if any path skips `withBrandContext` (superuser conn) | Med | Critical | **High** | Connect as non-superuser `brain_app` login role |
| R4 | Cannot deploy/operate in prod (no IaC, no observability) | High | Critical | **Critical** | Build Terraform/EKS/Helm/ArgoCD + Prom/OTel/Loki/alerts |
| R5 | Live secrets compromised | Low | High | **High** | Rotate Google + Gmail secrets; secrets manager |
| R6 | Abuse/DoS on un-throttled public endpoints | Med | High | **High** | Rate limiting + WAF |
| R7 | Event loss / PG↔CH divergence (fire-and-forget, no outbox) | Med | High | **High** | Idempotent producer + transactional outbox + consumers |
| R8 | Dashboard latency collapse on sale-day (sync `FINAL` CH, no cache) | High | High | **High** | Redis read buffer + CQRS read-model + drop `FINAL` |
| R9 | Regression in untested ~95% of code | High | Med | **Med** | Coverage thresholds; tests per service; real CI gates |
| R10 | Billing integrity (derived margin hardcoded, not metric-engine) | Med | High | **High** | Remove derived margin from Phase-1; metric registry in Phase-2 |

---

## 15. Prioritized Remediation Plan

**P0 — Critical blockers (before ANY production exposure)**
1. **Add ClickHouse row policies** to `brain.orders`/`payments`/`ad_spend` (R1). *(S)*
2. **Connect as non-superuser `brain_app` login role** in all envs (R3). *(M)*
3. **Fix the 5 NULLIF RLS policies** (R2). *(S)*
4. **Rotate the live Google + Gmail secrets**; move to a secrets manager (R5). *(S)*
5. **Lock CORS to an allowlist** + add **rate limiting + WAF** (R6). *(M)*
6. **Stand up production infra**: Terraform (VPC/EKS/RDS/MSK/ClickHouse), Helm + ArgoCD, build-and-push CI (R4). *(XL)*
7. **Observability**: `/metrics` + Prometheus, OTel tracing → Tempo, Loki + Alertmanager + dashboards + runbooks (R4). *(L)*

**P1 — High (Phase-1 completeness + hardening)**
8. Global `ValidationPipe` + DTOs/Zod; API versioning; keyset pagination; idempotency keys. *(M-L)*
9. Idempotent Kafka producer + **transactional outbox** + real consumers; route tracking through Kafka. *(L)*
10. **Redis** read buffer + CQRS read-model; drop `FINAL`; parallelize/rollup dashboard queries. *(L)*
11. Remove **hardcoded derived margin** from Phase-1 dashboards. *(S)*
12. Real test estate: coverage thresholds, per-service unit/integration, connector tests, contract tests; implement the 9 stub CI workflows + security scanners. *(L)*
13. Enforce **MFA** for Owner/Admin; `sslRequired`; token `aud` check; fix email-as-display_name. *(S-M)*

**P2 — Medium (debt + scale)**
14. Repository layer; split `BffService`; de-duplicate brand/connect logic; BFF `strict` tsconfig. *(M)*
15. Partitioning + retention execution (orders/audit/consent); `ReplacingMergeTree` on event tables. *(M)*
16. Delete dead/stub scaffolds or build them; bootstrap the **Product Canon**; reconcile docs↔reality with ADRs. *(M)*
17. Build the real Phase-1 data platform: tracking SDK + event pipeline + **customer identity resolution + 360** + remaining connectors (this is the bulk of unmet Phase-1 scope). *(XL)*

## 16. Quick Wins (high value, ≤ small effort)
- ClickHouse row policies on the 3 live tables (P0 #1).
- `NULLIF` fix on 5 RLS policies (P0 #3).
- Rotate secrets (P0 #4).
- CORS allowlist (P0 #5).
- Remove hardcoded CM ratios from dashboards (P1 #11).
- Delete dead code (`BffService.onboarding`, duplicate `notification*`, stub connectors) + extend BFF `tsconfig` to `strict`.
- Add `@nestjs/throttler` baseline rate limit.

## 17. Critical Blockers (the NO-GO list)
1. 🔴 **Live ClickHouse tenant tables have no row policy** — P0 cross-tenant leak (R1).
2. 🔴 **No production infrastructure** — no IaC/K8s/CD; cannot deploy (R4).
3. 🔴 **No production observability** — cannot operate/debug an incident (R4).
4. 🔴 **DB superuser connection + NULLIF fail-broken** — isolation one mistake from bypass / DoS (R2, R3).
5. 🔴 **Live secrets on disk** — rotate before any shared environment (R5).
6. 🔴 **No rate limiting / WAF** on public endpoints (R6).
7. 🟠 **~95% of code untested**; CI is mostly placeholders.
8. 🟠 **Phase-1 only ~35–40% complete** (tracking MVP, identity resolution absent, dashboards leak derived margin).

---

## 18. Final Go / No-Go

**🔴 NO-GO for enterprise-scale production.**

**Why:** P0 cross-tenant exposure on the live analytics tables, no deployable/observable production platform,
live secrets, no rate limiting, and a near-empty test estate outside the foundation. Phase-1 itself is only
~35–40% complete by the Blueprint's functional surface.

**The nuance (be fair):** the **platform-foundation slice is production-grade** — the four-layer tenant
isolation is real, tested, and the single hardest thing to retrofit; auth/RBAC/invites are solid; the ingest
pipeline and local dev-ex are excellent. This is a **credible, well-built foundation**, not a throwaway.

**Recommended path:** treat this as **late-Phase-1 foundation**. Execute the **P0 list** (mostly small, except
infra/observability) to make the foundation safely deployable, then the **P1 list** to finish Phase-1 (event
pipeline, identity resolution, real connectors, remove derived margin) before the enterprise-production
conversation. Re-audit after P0+P1.

**Estimated effort to a defensible Phase-1 production posture:** P0 ≈ 4–6 engineer-weeks (infra dominates);
P1 ≈ 8–12 weeks; P2/Phase-1-completion ≈ a quarter+ for the data platform.
