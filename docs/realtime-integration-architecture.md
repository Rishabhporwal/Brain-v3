# Real-Time Integration Architecture

How Brain connects to brands' commerce + advertising apps and ingests their data in (near) real time.
Grounded in how these platforms actually deliver data (see **Sources**), mapped onto our V2 stack
(NestJS `api-gateway-bff`, Postgres, ClickHouse, Redpanda/Kafka, the dev KMS vault).

> **TL;DR.** There is no single "real-time via webhooks" model. Data arrives **three** ways: **Push** (Shopify/
> Woo/payments/logistics **webhooks**), **Pull** (Meta/Google ad **polling** — they don't push metrics), and
> **Owned** (our **first-party pixel/SDK**, already built in M1). All three feed one Kafka data plane →
> ClickHouse. This matches how the category builds it — **Triple Whale** runs Kafka → **ClickHouse Kafka Engine
> + Materialized View → MergeTree**; **Northbeam** combines ad-platform pulls + store + its own first-party
> pixel at a **~15-min** refresh. We've built connect + the Shopify webhook lane + the first-party SDK; the
> polling lane and the ClickHouse consumers are next.

---

## 1. Principles

1. **Two ingestion lanes, one backbone.** Push (webhooks) and Pull (polling) both publish to Kafka; everything
   downstream is lane-agnostic.
2. **Connect ≠ ingest.** OAuth/credential connect (done) only yields a **vaulted token**. Ingestion is a
   separate, independently-scaled concern triggered off `integration.connected`.
3. **The BFF stays synchronous + thin.** Webhook receipt and OAuth live in the BFF; long-running pulls and
   stream processing live in **workers**, not the request path.
4. **Secrets in the vault, refs in the DB.** `integration.oauth_tokens.secret_ref` only; token material is
   AES-GCM/KMS-encrypted out of band (already true).
5. **Idempotent everywhere.** Webhooks redeliver; polls overlap. Dedup on provider event IDs; upserts keyed on
   natural keys.
6. **Backfill is a first-class, separate mode** from steady-state real-time (different APIs, different limits).

---

## 2. The three sources, one backbone

```
                          ┌──────────────────────────── PUSH LANE (webhooks) ───────────────────────────┐
   Shopify / Woo /        │  provider ──HTTP POST──▶  BFF  /api/webhooks/:provider                       │
   payments / logistics   │                          (verify HMAC over raw body, resolve brand, dedup)   │
                          └───────────────────────────────────────────────────┬─────────────────────────┘
                                                                               │  emitWebhook()
                                                                               ▼
   ┌──────────────────────── PULL LANE (polling) ───────────┐          brain.integration.webhooks  (Kafka, data plane)
   │  scheduler ──▶ per-brand puller (Meta async Insights,  │ produce         │
   │  Google SearchStream) using vaulted token ─────────────┼─────────────────┘
   │  cursor in integration.sync_state                      │
   └────────────────────────────────────────────────────────┘
                                                                               │  consume
                                                                               ▼
                                          consumers (normalizers) ──▶ ClickHouse (fact_spend, customer_events, orders…)
                                                                               │
   control plane:  integration.connected / .disconnected / sync.failed  ──▶ brain.integration.events (Kafka)
                                          └─▶ triggers webhook registration, health, alerts
```

**Kafka topics**
| Topic | Plane | Producer | Consumer |
|---|---|---|---|
| `brain.integration.events` | control | BFF (connect/disconnect, sync status) | webhook-registrar, health monitor, notifications |
| `brain.integration.webhooks` | data (push) | BFF webhook receiver | normalizers → ClickHouse |
| `brain.integration.pull` *(to add)* | data (pull) | pull workers | normalizers → ClickHouse |

Plus the **Owned** source — our **first-party SDK** (`POST /api/track`, built in M1) — the same role as
Northbeam's pixel. It writes behavioural events to `brain.customer_events`; at scale it should publish through
Kafka too so all three sources share one ingestion path.

Versioned JSON envelope today (`schema_version`, `received_at`, `provider`, `topic`, `brand_id`, `payload`);
Avro + Redpanda Schema Registry (`:18081`) is the production upgrade.

**Consumer pattern (how Triple Whale lands it in ClickHouse).** The canonical real-time pattern is the
**ClickHouse Kafka Engine + Materialized View → MergeTree** trio: a Kafka-engine table subscribes to a Redpanda
topic, an MV transforms each message and inserts into a `MergeTree` (or `ReplicatedMergeTree`) fact table.
Use it for straightforward normalization (orders, ad spend). For anything needing cross-source enrichment or
**identity resolution** (stitching first-party events to orders to ad clicks), run a **custom consumer service**
that writes to ClickHouse. We'll use both: Kafka-Engine for the simple high-volume facts, a service for the
attribution joins.

---

## 3. Per-provider mechanics (the important part)

| Provider | Category | Real-time data | Mechanism | Control events |
|---|---|---|---|---|
| **Shopify** | storefront | orders, products, customers, inventory | **Webhooks (push)** — HMAC over raw body; backfill via **Bulk Operations** | `app/uninstalled`, GDPR (`shop/redact`, `customers/redact`, `customers/data_request`) |
| **WooCommerce** | storefront | orders, products, customers | **Webhooks (push)** — `X-WC-Webhook-Signature` (HMAC-SHA256, base64); backfill via REST | delete/restore |
| **Meta Ads** | ads | spend, impressions, ROAS, conversions | **Polling (pull)** — **async Insights jobs**: `POST act_{id}/insights` → poll `async_status` → `GET {report_run_id}/insights` | Webhooks exist only for **changes** (budget/status/approval, leadgen) — *not* metrics |
| **Google Ads** | ads | spend, clicks, conversions | **Polling (pull)** — **`GoogleAdsService.SearchStream`** (GAQL); incremental via **ChangeStatus/ChangeEvent** | No metric webhooks |
| **Shiprocket / logistics** | logistics | shipment status, RTO, NDR | **Webhooks (push)** where available, else polling | — |
| **Razorpay / Stripe** | payments | payments, refunds, settlements, disputes | **Webhooks (push)** — provider HMAC | — |

### Meta Ads — async Insights polling (no metric push)
- Submit: `POST /v{ver}/act_{ad_account_id}/insights` with `level`, `fields`, `time_range`/`date_preset`,
  `breakdowns` → returns a **`report_run_id`**.
- Poll `report_run_id` until `async_status = "Job Completed"` and `async_percent_completion = 100`
  (jobs run up to ~60 min; run IDs **expire after 30 days** — don't persist them).
- Fetch: `GET /{report_run_id}/insights`.
- **Rate limits**: ~**5 insights calls/min per ad account**; watch the `X-FB-Ads-Insights-Throttle` header
  (`app_id_util_pct`, `acc_id_util_pct`) and back off. This caps practical freshness — plan for **5–15 min**
  cadence per ad account, not seconds.
- Note 2025/26: tightened attribution windows + data-retention; webhook **mTLS → Meta CA by 2026-03-31**.

### Google Ads — SearchStream + change tracking
- Pull report rows with **`SearchStream`** (one request, persistent stream of GAQL rows — faster than paginated
  `Search` for large reports).
- **Incremental**: first sync = full refresh; thereafter read **ChangeStatus** (which resources changed, latest
  change only, **last 3 months**) then re-pull those IDs. **ChangeEvent** gives old+new field values.
- Auth: OAuth **refresh token** (access token expires in 1h) + a **developer token** (22-char) +
  `login-customer-id` (manager) — we already capture these (`GOOGLE_ADS_*`).

### Shopify — webhook lane (built) + best practices
- ✅ HMAC-SHA256 over the **raw** body with the app secret; ✅ fast `200`; ✅ publish to Kafka (the queue) — don't
  process inline.
- ➕ **Idempotency**: dedup on the **`X-Shopify-Webhook-Id`** header (Shopify may deliver twice) — needs a seen-set
  (Redis/ElastiCache or a small Postgres dedup table).
- ➕ **Scale option**: Shopify also delivers via **Amazon EventBridge / Google Pub/Sub** (trusted channels — no
  HMAC needed). Consider for very high volume later.
- **Backfill**: historical orders/products via **Bulk Operations** (GraphQL bulk → JSONL), a separate one-shot job.

---

## 4. Scaling to 100+ apps — the connector framework

Three providers is the proof; **100+ is the design constraint.** The answer is the same one Airbyte (600+),
Fivetran (300+) and Estuary (150+) use: **don't write 100 bespoke integrations — write one framework that
100 thin connectors compose.** Our repo already scaffolds exactly this in `connector-platform/`
([Arch §9](Brain_Repository_Architecture.md)): a shared `_kit/`, a `registry/`, one deployable per provider,
and a `_template/` cookiecutter.

```
connector-platform/
├── registry/        connector config · per-brand connections · token refs (vault) · sync cursors · health
├── _kit/            the framework EVERY connector composes (write once, reuse 100×):
│     oauth · webhook-engine (validate+dedupe) · sync-engine (backfill+incremental cursors)
│     retry-engine (backoff+circuit-breaker) · rate-limiter (per-provider budgets) · health · dlq · writeback
├── connectors/      ONE thin deployable per provider — shopify, meta-ads, google-ads, stripe, razorpay,
│                    shiprocket, whatsapp, tiktok-ads, crm-*, marketplaces, gcc, … + _template
└── custom-integration-framework/   enterprise/custom + light POS
```

### The connector contract (what makes app #4…#100 cheap)
A connector is a thin module that **declares a manifest** and **implements a few hooks**; `_kit` does the
heavy lifting (scheduling, rate-limits, retries, DLQ, health, publishing to Kafka). New app = fill the template.

```ts
// manifest — declarative capabilities (drives the runtime + the Settings UI)
{
  provider: 'shopify', category: 'storefront', tier: 1,
  auth: 'oauth2',                      // oauth2 | apikey | basic
  ingest: ['push'],                    // which lanes: push | pull | owned
  streams: [
    { name: 'orders',   mode: 'push', primaryKey: 'id', schema: OrderSchema },
    { name: 'products', mode: 'push', primaryKey: 'id', schema: ProductSchema },
  ],
  rateLimits: { ... }, backfill: 'bulk',
}

// hooks — only implement what the provider supports; _kit fills the rest
authorizeUrl()/exchangeCode()                 // → _kit/oauth (token to vault, auto-refresh)
registerWebhooks(token)                       // push: subscribe topics
verifyWebhook(rawBody, headers) → records[]   // push: _kit/webhook-engine verifies + dedupes, you map → records
pull(stream, cursor, token) → {records, nextCursor}   // pull: _kit/sync-engine schedules + advances cursor
backfill(stream, token) → AsyncIterable<record>       // one-shot history
```

Every connector emits the **same normalized record shape** to Kafka, so downstream consumers/ClickHouse never
learn about provider #57 — they consume streams (`orders`, `ad_spend`, `shipments`), not vendors.

### Per-connector isolation (the scale + blast-radius answer)
**One deployable per provider** (from P2). A Shopify webhook storm, a Meta rate-limit ban, or a TikTok API
outage is contained to that connector's pod — its own **rate budget, circuit breaker, DLQ, and autoscaling**.
The other 99 keep flowing. This is why the framework isn't optional at 100+: shared-process ingestion means one
misbehaving vendor degrades all of them.

### Where today's code fits (lean-core → framework)
The Shopify/Meta/Google logic I built in `api-gateway-bff` **is** the P1 "lean-core single ingestion path"
([Arch §9](Brain_Repository_Architecture.md): *single path in P1; per-connector split from P2*). It graduates,
not gets thrown away:
| Built in BFF (P1) | Graduates to |
|---|---|
| `ShopifyService` OAuth + HMAC + register + handle | `connectors/shopify/` composing `_kit/{oauth,webhook-engine}` |
| `OAuthService` (Google/Meta) | `connectors/{google-ads,meta-ads}/` + `_kit/oauth` |
| `WebhooksController` raw-body verify | `_kit/webhook-engine` (generic) + provider mapping |
| `vault.ts`, `oauth_tokens.secret_ref` | `registry/` token store + `_kit/oauth` |
| `events.ts` Kafka producer | producers move into each connector deployable; topics unchanged |

### Adding a connector (the 100+ path, in 5 steps)
1. `cp -r connectors/_template connectors/<provider>`
2. Fill the **manifest** + implement the **hooks** it supports (push? pull? backfill?).
3. Register it (`registry/` + `reference.connector_catalog`); add secrets to the vault + a provider mock.
4. `_kit` gives you OAuth, scheduling, rate-limits, retries, DLQ, health for free.
5. Deploy (own service from P2). No new infra; no downstream changes.

---

## 5. State, reliability, security

- **Cursors / sync state** → `integration.sync_state` (already in schema: `cursor`, `last_sync_at`,
  `lag_seconds`). Pull workers advance the cursor; lag feeds health.
- **Connector health** → `integration.connector_health` (already in schema: `completeness_score`,
  `blocks_recommendations`). Stale/failed sync **withholds high-risk recommendations** (Brain rule).
- **Idempotency**: webhooks → dedup on provider event id; pulls → upsert on natural keys (order id, ad+date).
  Consumers must be safe to re-run.
- **Token lifecycle**: refresh before expiry; on refresh failure set `oauth_tokens.refresh_failed_at`, emit
  `integration.degraded`, alert, and surface "Reconnect" in Settings → Integrations.
- **Rate limits / backpressure**: per-provider token-bucket; honor `Retry-After` / throttle headers; jitter; the
  scheduler spreads brands so we never thundering-herd a provider.
- **Security/compliance**: webhook HMAC (done for Shopify), provider IP/UA where offered, GDPR webhooks acked,
  least-privilege scopes, secrets only in the vault. DPDP/PDPL residency: pin storage by brand region.

---

## 6. What's built vs. to build

| Capability | Status | Where |
|---|---|---|
| OAuth connect + token vault (Shopify, Google, Meta) | ✅ | `IntegrationsController`, `ShopifyService`, `OAuthService`, `vault.ts` |
| WooCommerce connect (validate + vault) | ✅ | `OnboardingService.connectWoocommerce` |
| `integration.connected` control event → Kafka | ✅ | `events.ts` (`brain.integration.events`) |
| **Shopify webhook receiver** (HMAC, brand-resolve, → Kafka) | ✅ | `WebhooksController`, `ShopifyService.handleWebhook` |
| Shopify webhook **registration** on connect | ✅ (best-effort; needs public URL) | `ShopifyService.registerWebhooks` |
| Shopify webhook **idempotency** (`X-Shopify-Webhook-Id`) | ⏳ | needs Redis/dedup table |
| **Polling lane** (scheduler + Meta/Google pullers) | ⏳ | new worker(s) → `brain.integration.pull` |
| **Consumers → ClickHouse** (normalizers) | ⏳ | new consumer service(s) |
| WooCommerce / payments / logistics webhook receivers | ⏳ | extend `WebhooksController` |
| Backfill jobs (Shopify Bulk, Meta/Google historical) | ⏳ | separate one-shot workers |
| Avro + Schema Registry | ⏳ | Redpanda `:18081` |
| EventBridge/Pub/Sub delivery (scale) | ⏳ | optional |

---

## 7. Phased roadmap

- **P0 — Extract `_kit` from the BFF prototype.** Lift the working OAuth/webhook/HMAC/dedup logic into
  `connector-platform/_kit/{oauth,webhook-engine}` + define the **connector contract** (manifest + hooks) and
  the `registry`. `connectors/shopify` becomes the first consumer of the kit. No behaviour change — just the
  right seams so #4…#100 are cheap.
- **P1 — Close the Shopify loop (push, end-to-end).** Idempotency dedup (`X-Shopify-Webhook-Id`) + a **consumer**
  (ClickHouse Kafka-Engine + MV → MergeTree) that normalizes `orders/*`. Proves push → query end-to-end.
- **P2 — Polling lane via `_kit/sync-engine`.** Scheduler + `pull()` hook (token from vault, cursor in
  `sync_state`, rate-limit aware) → `brain.integration.pull`. **Google Ads (SearchStream)** first, then
  **Meta (async Insights jobs)**. Each as its own `connectors/<provider>` deployable.
- **P3 — Normalizers → ClickHouse for ads.** `fact_spend`/`ad_spend` from the pull topic; wire
  `connector_health` + `sync_state` lag; refresh-fail → degraded + "Reconnect".
- **P4 — Breadth via `_template`.** WooCommerce + payments + logistics connectors (compose `_kit`); backfill
  jobs; Avro/Schema-Registry; EventBridge/Pub-Sub at scale; per-connector isolation (split deployables).

---

## Sources
- Shopify — [Verify webhook deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries),
  [Webhooks best practices](https://hookdeck.com/webhooks/platforms/shopify-webhooks-features-and-best-practices-guide),
  [EventBridge/Pub-Sub trusted channels](https://community.shopify.com/c/shopify-apis-and-sdks/amazon-eventbridge-webhook-verification/td-p/891705)
- Meta — [Insights API](https://developers.facebook.com/docs/marketing-api/insights/),
  [Insights limits & best practices](https://developers.facebook.com/docs/marketing-api/insights/best-practices/),
  [Marketing API rate limiting](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/)
- Google Ads — [Report streaming (SearchStream)](https://developers.google.com/google-ads/api/docs/reporting/streaming),
  [Change Status](https://developers.google.com/google-ads/api/docs/change-status),
  [Change Event](https://developers.google.com/google-ads/api/docs/change-event),
  [OAuth overview](https://developers.google.com/google-ads/api/docs/oauth/overview)
</content>
