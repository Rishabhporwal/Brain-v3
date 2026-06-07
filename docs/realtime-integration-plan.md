# Real-Time Integration — Implementation Plan (for review)

Companion to [realtime-integration-architecture.md](realtime-integration-architecture.md). This is the
**actionable plan**: phases, concrete deliverables, verification gates, and the **decisions I need from you**.
**Nothing here is built yet — this is for review/approval before any implementation.**

## Scope
Build a connector platform that ingests brands' data in (near) real time from 100+ apps via three lanes —
**push** (webhooks), **pull** (polling), **owned** (first-party SDK) — onto one Kafka backbone → ClickHouse.
Prove it end-to-end on **Shopify (push)** and **Google/Meta Ads (pull)**, on a framework that makes app
#4…#100 a template-fill, not bespoke code.

**Non-goals (now):** the attribution/metric engine (Phase 2 of the product), write-back actions (P5), Avro
migration, EventBridge/Pub-Sub delivery, the full 100 connectors (we build the framework + the first ~4).

## Guiding decisions already taken (from the architecture doc)
- Three lanes, one backbone (`brain.integration.{events,webhooks,pull}`), versioned JSON envelope.
- Ad platforms are **pull** (Meta async Insights; Google SearchStream), realistic cadence **5–15 min**.
- The BFF code is the **P1 lean-core**; it **graduates** into `connector-platform/_kit` + `connectors/*`.
- ClickHouse ingestion via **Kafka-Engine + MV → MergeTree** for simple facts; **custom consumer** for joins.

---

## Phases

### P0 — Connector framework foundation (`_kit` + registry + contract)  ✅ DONE
**Built:** `@brain/connector-kit` (contract incl. **connect/authorize hooks** — authorize→token→ingest is
enforced for every app — plus oauth signed-state, `verifyHmac`, `SeenStore` idempotency; 5 unit tests),
`@brain/connector-shopify` (manifest + topics + `verifyShopifyWebhook` composing the kit),
`@brain/connector-template` (cookiecutter showing connect→ingest), `@brain/connector-registry` (catalog).
The BFF now **consumes** the kit/connector (oauth-state + webhook HMAC + topics routed through them) — proven
through `nest build` (workspace package resolution) with **no behaviour change**: 25 BFF tests + webhook
200/401 + onboarding e2e all green.
**Objective:** the seams that make 100+ cheap, by lifting the *working* BFF logic — no behaviour change.
- Define the **connector contract** (manifest + hooks) as a shared TS package.
- `_kit/oauth` (from `ShopifyService`/`OAuthService` + `vault`), `_kit/webhook-engine` (from `WebhooksController`
  + HMAC/dedup), `registry` (connector config, token refs, sync cursors, health) over the existing
  `integration.*` tables.
- `connectors/shopify` becomes the first consumer of `_kit`; the BFF delegates to it (or re-exports).
**Deliverables:** `connector-platform/_kit/{oauth,webhook-engine}`, `registry`, `connectors/_template`,
`connectors/shopify` (thin).
**Verification:** existing Shopify connect + webhook e2e still green, now routed through `_kit`; unit tests for
the contract.
**Risk:** scope creep — keep it a *refactor with seams*, not a rewrite.

### P1 — Close the Shopify loop (push → ClickHouse, end-to-end)  ✅ DONE
**Built + verified:** idempotency via `X-Shopify-Webhook-Id` → `integration.webhook_receipts` (Postgres
`PgSeenStore` implementing the kit's `SeenStore`) — 2 deliveries = **1** Kafka event; ClickHouse consumer
(`brain.kafka_integration_webhooks` Kafka-Engine → `brain.mv_orders` MV → `brain.orders` ReplacingMergeTree)
normalizing Shopify `orders/create|updated`. Proven end-to-end: order webhook → BFF (verify+dedup+resolve) →
Kafka → `brain.orders` (₹3499/paid/customer, tz-correct); `orders/updated` collapses to **one** row (latest).
25 unit + 26 integration + onboarding e2e green.
**Objective:** a real Shopify order webhook becomes a queryable ClickHouse row.
- **Idempotency**: dedup on `X-Shopify-Webhook-Id` (store choice below).
- **Consumer**: ClickHouse **Kafka-Engine table + MV → MergeTree** consuming `brain.integration.webhooks`,
  normalizing `orders/create|updated` into an `orders`/`order_lines` model (new ClickHouse model).
- **Backfill** (optional this phase): Shopify Bulk Operations one-shot for historical orders.
**Deliverables:** dedup in `_kit/webhook-engine`; ClickHouse `orders` model + MV; (opt) backfill job.
**Verification:** simulated + (tunnel) real webhook → row in ClickHouse; duplicate delivery → one row; counts match.

### P2 — Polling lane (`_kit/sync-engine`) for Google + Meta  ✅ DONE
**Built + verified:** `_kit` gained `sync-engine` (cursor-driven `runStreamSync`/`runConnectorSync`),
`rate-limiter` (TokenBucket), `retry` (backoff + circuit breaker) — 9 kit unit tests. `@brain/connector-google-ads`
(GAQL SearchStream + OAuth refresh) + `@brain/connector-meta-ads` (async Insights submit→poll→fetch). BFF
`PullService` loads the vaulted token (refresh-on-expiry → `refresh_failed_at` on failure), drives the connector
through the sync-engine (cursor in `integration.sync_state`), publishes to **`brain.integration.pull`**. Guarded
trigger `POST …/integrations/:provider/sync`. **Verified e2e (mocks):** connect → sync → Google 2 campaigns +
Meta 1 campaign on the pull topic, **cursor advanced** to today. 25 unit + 26 integration + e2e green.
**Objective:** ad spend/ROAS pulled on a schedule into Kafka.
- `_kit/sync-engine` (scheduler, per-brand cursor in `integration.sync_state`, rate-limiter, retry/circuit-breaker).
- `connectors/google-ads`: `pull()` via **SearchStream** (GAQL daily campaign stats) + incremental via ChangeStatus.
- `connectors/meta-ads`: `pull()` via **async Insights jobs** (submit → poll → fetch), throttle-aware.
- Tokens from vault; auto-refresh; refresh-fail → `degraded` + "Reconnect".
**Deliverables:** `_kit/{sync-engine,rate-limiter,retry-engine,dlq,health}`, two connectors → `brain.integration.pull`.
**Verification:** with real creds, one scheduled cycle lands spend rows on the pull topic; rate-limit headers respected.

### P3 — Ad normalizers → ClickHouse + health
**Objective:** ad data queryable; integration health visible.
- Consumer normalizes the pull topic → ClickHouse `fact_spend`/`ad_spend`.
- Wire `integration.connector_health` (completeness, lag) + surface on Settings → Integrations.
**Deliverables:** ad-spend ClickHouse model + consumer; health surface.
**Verification:** spend visible end-to-end; stale sync → health degrades → withholds high-risk recs (Brain rule).

### P4 — Breadth via `_template`
WooCommerce + payments (Razorpay/Stripe) + logistics (Shiprocket) connectors (compose `_kit`); per-connector
deployable split; Avro/Schema-Registry; EventBridge/Pub-Sub option. Each is "fill the template."

---

## Cross-cutting
- **Testing:** unit (contract, HMAC, cursor math, rate-limit), integration (live DB/CH), e2e (webhook→CH, pull→CH),
  provider mocks in `deploy/local/compose/mocks.yml`.
- **Security/compliance:** HMAC on all webhooks, secrets only in vault, least-privilege scopes, GDPR webhooks acked,
  DPDP/PDPL residency (pin storage by brand region), per-connector isolation.
- **Observability:** sync lag, error rate, DLQ depth, throttle utilization per connector.
- **Local real delivery:** a tunnel (cloudflared/ngrok) so real Shopify webhooks reach localhost.

---

## Open decisions — need your call before I start

| # | Decision | Options | My recommendation |
|---|---|---|---|
| D1 | **Start with P0 (extract framework) or P1 (finish Shopify in BFF) first?** | P0-first (right seams early) · P1-first (value first, refactor later) | **P0-first** — you explicitly want 100+ scale; building #2–3 in the BFF then migrating is rework. |
| D2 | **ClickHouse ingestion mechanism for P1** | Kafka-Engine + MV (less code, Triple Whale pattern) · custom consumer service (more control) | **Kafka-Engine + MV** for orders/spend facts; custom service later only for attribution joins. |
| D3 | **Connector/worker language** | TypeScript/NestJS (consistent w/ BFF) · Python (consistent w/ intelligence pod) | **TypeScript** — connector-platform is the Integration pod (TS); reuse the BFF code we have. |
| D4 | **Idempotency store** | Postgres dedup table (no new infra) · Redis/ElastiCache (faster, TTL) | **Postgres table** for now; move to Redis when volume warrants. |
| D5 | **First end-to-end slice** | Shopify `orders` (push) · Google `ad_spend` (pull) | **Shopify orders** — push is already wired; fastest to a visible end-to-end win. |
| D6 | **Backfill in P1 or defer?** | Include Shopify Bulk backfill in P1 · defer to P4 | **Defer** — prove real-time first; backfill is a separable one-shot. |
| D7 | **Local real webhook delivery** | Set up a tunnel (cloudflared) now · keep simulating locally | **Simulate now**, add a tunnel when you want to see your real store flow. |

## Sequencing
D1 gates everything. With my recommendations: **P0 → P1 (Shopify orders → ClickHouse) → P2 (Google, then Meta)
→ P3 → P4.** Each phase ends at a green verification gate before the next starts.
