# Third-Party Pixel Tracking & Customer Memory Layer — System Design

> **Module:** Third-Party Pixel Tracking (the data-collection + identity + attribution foundation).
> Despite the name, the system is a **hybrid** — first-party pixel + server-side + third-party/CAPI + webhook
> + SDK collection — that feeds the **customer memory layer**: the append-only event spine + identity graph
> that powers attribution, customer intelligence, personalization, audiences, journeys, and AI/decisioning.
>
> **Status:** design (research-backed). Research corpus: Northbeam, Triple Whale, Cometly, Black Crow AI,
> Segment, RudderStack, mParticle, Adobe Experience Platform, GA4, Meta Pixel+CAPI, Shopify Web Pixels,
> Google sGTM, Klaviyo, Customer.io (citations at the end).

---

## 0. Design principles (non-negotiable)

1. **First-party by construction.** Own the collection endpoint (own subdomain, same-origin/IP) so durable
   identity survives Safari ITP / Firefox ETP. Third-party/CAPI is a *mirror*, never the source of truth.
2. **Server-side is the source of truth.** The client emits; the server validates, stamps, dedups, persists.
   Client-only signal is lossy (40–60% post-ATT) — a hint, reconciled to server/webhook facts.
3. **Append-only memory.** Raw events are immutable (Iceberg = system of record). Profiles, journeys, and
   attribution are *derived* and fully **rebuildable by replay** from raw.
4. **Identity is a typed, per-tenant, bounded, reversible graph.** Deterministic spine + labelled probabilistic
   overlay; cardinality limits + priority that **fail closed**; merges are append-only events (auditable/undoable).
5. **Consent is a first-class signal on every event,** enforced server-side (suppress / transform / route).
6. **Tenant isolation is structural.** `brand_id` on every event, topic key, row (RLS), cache key, log line.
   **Customer identities never cross brands** (same person on two brands = two customers).
7. **Deterministic numbers, honest revenue.** Attribution reconciles to *realized* revenue (post refund/RTO),
   never placed/platform-reported. AI may narrate a number, never invent it.

---

## 0.5 Alignment with Brain (BRD · Solution Architecture · Blueprint)

This module is not a greenfield bolt-on — it is the **First-Party Data Foundation (BRD Pillar 1)** and the
**Decision Memory (Pillar 4)** substrate, sequenced as **Blueprint Phase 1 (First-Party Data Platform + Event
Collection Platform, §2.10–2.11)** with attribution arriving in **Phase 2**. Concrete alignment:

- **Stack reuse (no new primitives):** Kafka (MSK) backbone, ClickHouse OLAP, Aurora/Postgres OLTP with the
  **existing RLS + `app.current_brand`**, S3+Iceberg lakehouse, Redis, NestJS (platform) + Python (AI/ML) — all
  already in `Brain_Solution_Architecture` §7/§13. We extend the **already-designed but unused** `event_platform.*`,
  `brain.*` (raw/normalized/customer_events/sessions), `identity.*`, and `consent.*` schema — not new stores.
- **Tenant isolation:** reuses the shipped **`@brain/access-control`** four-layer model (Layer-1 guard +
  Layer-2 RLS + Layer-3 assertion + Layer-4 isolation CI gate); the workspace key is `brand_id`; customer
  identities never cross brands — matching the architecture's "structural tenant isolation" invariant.
- **Region adapters, never forks:** region rules (currency/tax/timezone, residency) plug in via the
  Region Adapter; India launch, GCC later — per the architecture's region-adapter pattern + per-region clusters.
- **Realized over placed / deterministic numbers:** attribution reconciles to the realized-revenue ledger;
  the **metric engine remains the only producer of business figures** (this module produces *events + identity*,
  not derived margin) — honoring the architecture's two invariants.
- **Event-driven by default; safe by construction:** every state change is a `brand_id`-keyed Kafka event,
  replayable; activation/write-back (CAPI/Ads) passes through guardrails (Phase 5) — consistent with the loops model.
- **Compounding memory = the moat:** the append-only event spine + identity graph + (later) Decision Log are the
  "customer memory layer" the BRD calls Brain's most durable competitive asset.
- **Lean-core discipline:** Phase 1 ships the lean collection+identity core; Neo4j graph, Flink, MMM, and
  per-discipline splits arrive in the phases the architecture assigns them — never the full footprint early.

Net: this plan is a faithful, deeper instantiation of Brain's own roadmap for the data foundation, using
industry best practice (Segment/Meta/Adobe/etc.) to harden the *how* — not a divergent architecture.

---

## 1. System Architecture

### 1.1 Logical layers
```
                    ┌──────────────────────── COLLECTION ────────────────────────┐
  Browser pixel ──▶ │   Edge Collector (first-party subdomain, own IP)            │
  (Web SDK)         │   - write-key auth → brand_id   - server-set HttpOnly id    │
  Mobile SDK ─────▶ │   - consent gate   - envelope validate   - dedup(messageId) │
  Server SDK ─────▶ │   - set event_id   - capture fbp/fbc/gclid/IP/UA           │
  Webhooks ───────▶ │                                                             │
  3p / CAPI mirror  └───────────────┬─────────────────────────────────────────────┘
                                     │ append raw + publish (key = brand_id[:user])
                                     ▼
        Kafka  brain.raw.events ──────────────────────────────────────────────────
                                     │
                    ┌────────────────▼──────── PROCESSING (workers / Flink) ───────┐
                    │ normalize(region rules) → enrich(geo,device,campaign) →       │
                    │ validate(schema registry) → identity resolve/stitch →        │
                    │ sessionize → route                                           │
                    └───┬───────────────┬───────────────┬───────────────┬─────────┘
                        ▼               ▼               ▼               ▼
        brain.normalized.events   customer_events   identity graph   brain.events.dlq
        + S3/Iceberg (raw SoR)    sessions (CH)     (Aurora+graph)   (+ Aurora index)
                        │               │               │
                        ▼               ▼               ▼
              REPLAY / BACKFILL    SERVING (read models)   ATTRIBUTION (P2) · AUDIENCES (P3) · AI (P4)
                                     ▲
                            Surfaces / Metric Engine / Activation (CAPI/Ads write-back)
```

### 1.2 Two lanes
- **Ingest lane** (fast, durable): accept → validate envelope → dedup → append raw (Iceberg) → publish to
  Kafka. `202` in <50ms. Never backpressures the client; a bad event → DLQ, never a 5xx.
- **Process lane** (async, replayable): normalize → enrich → schema-validate → identity-resolve → sessionize →
  write derived stores. Idempotent + order-independent; the **same code path runs live and on backfill**.

### 1.3 Service decomposition (Brain topology, lean-core P1)
| Service | Responsibility | Phase |
|---|---|---|
| **Edge Collector** (`event-ingestion`) | first-party HTTP collector; write-key auth; consent gate; dedup; raw append; publish | P1 |
| **Tracking** | write-key issuance/rotation; tracking plan/schema registry admin; verification | P1 |
| **Event Processor** | normalize/enrich/validate/sessionize consumer (lean Node → Flink at scale) | P1 |
| **Identity Resolution** | identity graph build, stitch, merge/split, cardinality enforcement | P1 (graph→Neo4j P4) |
| **Customer Profile / 360** | profile assembly from identity + events + consent | P1→P3 |
| **Attribution** | journey build, multi-touch + data-driven + incrementality | P2/P4 |
| **Consent** | consent state, suppression, erasure orchestration | P1 (enforced P3) |
| **Activation** | CAPI / Ads / messaging write-back (mirror + audiences) | P2→P3 |

---

## 2. Data Flow Diagrams

### 2.1 Hybrid client+server conversion (Meta/GA4 dedup pattern)
```
User clicks "Buy"
  ├─(client) Web SDK: generate event_id (UUID) → fire browser pixel + POST to Edge Collector
  └─(server) Edge Collector: REUSE same event_id → raw.events → Processor
         ├─ persist customer_event
         └─ Activation: POST Meta CAPI / GA4 MP  (event_id+event_name identical → vendor dedups;
              user_data = SHA-256(email,phone) + raw fbp/fbc/IP/UA)
Order webhook (Shopify) → Edge Collector → raw.events → reconcile to realized revenue (source of truth)
```
**Dedup contract:** one `event_id` per user action, byte-identical across browser + server + CAPI. Internal
dedup on `messageId`; vendor dedup on `event_id`+`event_name`.

### 2.2 Anonymous → known stitching (cart-token pattern)
```
Anonymous visit → Web SDK mints anonymousId → cookie AND Shopify cart attributes
   ... browsing events carry anonymousId ...
Checkout → cart token carries anonymousId → appears on Order webhook
Login/identify(email) → Identity Resolution links anonymousId ↔ customerId
   → prior anonymous events retro-attributed (append-only merge event)
```

### 2.3 Replay / backfill
```
S3/Iceberg raw (Bronze, immutable) ──(re-read offsets, SAME processor code)──▶
   rebuild normalized.events / customer_events / identity graph / sessions  (idempotent → parity)
```

---

## 3. Event Taxonomy

Adopt the **Segment Spec** call shape + **e-commerce V2** names (ecosystem interop) and the **Shopify standard
customer events** for storefront capture.

**Calls:** `track`, `identify`, `page`, `screen`, `group`, `alias`/`merge`, `consent`.

**Canonical commerce events:** `Products Searched`, `Product List Viewed`, `Product Viewed`, `Product Added`,
`Product Removed`, `Cart Viewed`, `Checkout Started`, `Payment Info Entered`, `Order Completed`,
`Order Updated`, `Order Refunded`, `Order Cancelled`.

**Reserved properties:** `product_id, sku, category, name, brand, variant, price, quantity, cart_id, order_id,
revenue, value, currency, coupon, discount`. **Money = integer minor units + `currency_code`** (Brain metric-
registry convention). Per-type routing/retention/erasure/PII/consent-purpose live in `event_platform.event_metadata`.

---

## 4. Identity Resolution Framework

- **Graph:** nodes = typed identifiers (`customer_id, email, phone, anonymous_id, device_id, session_id,
  shopify_customer_id, gclid/fbclid, fbp/fbc`); edges = co-occurrence **with evidence**; a profile = a connected
  component **scoped to one `brand_id`** (never cross-tenant).
- **Trust hierarchy (merge priority):** `customer_id > email > phone > shopify_customer_id > device_id >
  anonymous_id > session_id/click_id`. **Deterministic** spine; **labelled probabilistic** overlay only enriches
  cross-device (never anchors a merge; brand-disableable).
- **Bounding (critical safety):** per-namespace **cardinality limits** by stability (`customer_id`=1;
  `email`/`device_id`=5/yr; `anonymous_id`=5/wk) + **priority**; on breach → **stop merging, keep resolving**
  (fail closed). Prevents the "library problem" graph collapse on shared devices.
- **Reversible/auditable merges:** append-only edge ledger (`identity.identity_edges`) with evidence → replay/
  undo; split = revoke edge + recompute component.
- **Anonymous→known:** bind pre-login `anonymous_id`→`customer_id` on identify; replay full anonymous history
  (Klaviyo-style); carry `anonymous_id` via Shopify cart attributes to survive to the order webhook.
- **Phasing:** P1 deterministic in Aurora (`identity.customers`+`customer_identities`+edge ledger); P4 Neo4j +
  probabilistic overlay.

---

## 5. Attribution Framework *(engine = Phase 2+, designed now)*

- **Journeys:** sequence touchpoints per resolved customer; reconcile credit to the realized-revenue ledger
  (no double counting across platforms).
- **Models (offer all; default position-based):** rule-based (first/last/last-non-direct/linear/time-decay/
  U-shaped) for auditability; **data-driven** (Markov removal-effect, Shapley — Python over ClickHouse journeys,
  needs ~2k+ conv/mo); **incrementality** (geo/holdout lift — post-cookie gold standard). **Pair MTA +
  incrementality** to calibrate; every experiment → audit log.
- **Honesty:** reconcile to realized revenue (net discounts/refunds/RTO; refunds = separate events/date fields);
  finalize on 48–72h lag; label estimates until the data-quality gate passes. Numbers still originate in the
  metric engine.

---

## 6. Data Model & Database Design (extends existing schema)

**Aurora/Postgres (RLS, `app.current_brand`):** `tracking.tracking_keys` (+rotation), `event_platform.
event_schema_versions` (registry mirror), `event_platform.event_metadata`, `event_platform.event_dead_letter_queue`,
`identity.customers` + `identity.customer_identities`, **new `identity.identity_edges`** (append-only edge
ledger), `consent.*` (versioned timeline).
**ClickHouse (row policies on `brain_current_brand`, partition by month, `ORDER BY (brand_id,…)`):**
`brain.raw_events` (serving copy), `brain.normalized_events`, `brain.customer_events`
(**`ReplacingMergeTree((brand_id,event_id))`** late-dup safety net), `brain.sessions`; (P2) `touchpoints`,
`journeys`, `attribution_results`.
**S3+Iceberg:** immutable Bronze SoR → Silver deduped → Gold aggregates; time-travel + branches for backfills.
**Redis:** dedup (`tenantId:messageId`, TTL 24h–7d), session cache, rate-limit, idempotency keys.
**Kafka topics** (key=`brand_id`[:`user`]): `brain.raw.events`, `brain.normalized.events`, `brain.events.dlq`,
`brain.identity.merges`.

---

## 7. API Specifications

- **Ingestion (public, write-key auth, not Keycloak):** `POST /v1/track` (`x-brain-key`), `POST /v1/batch`
  (≤2500 ev / 500KB; per-event accept/reject; failures→DLQ), `/v1/identify|page|alias`, `GET /v1/health`. CORS
  allowlist + token-bucket rate limit per key.
- **Webhook ingestion:** `POST /v1/webhooks/:provider/:brandId` — HMAC-verified, deduped, normalized (reuses
  Brain's webhook engine).
- **Canonical envelope:** `{ event, type, messageId (dedup), eventId (vendor dedup, reused client↔server),
  anonymousId, userId, timestamp (+server receivedAt, skew-corrected), consent{analytics,ads,tcString},
  context{page,device,campaign{gclid,fbclid}, ids{fbp,fbc,ga_client_id}, ip, userAgent}, properties|traits }`.
  `brand_id`+`region` resolved **server-side from the write-key** — never from the client.
- **Admin (Keycloak + `@brain/access-control` RBAC):** write-key issue/rotate/revoke; tracking-plan CRUD +
  violation review; identity merge/split (audited); consent + erasure; replay/backfill trigger.

---

## 8. SDK Design Guidelines

- **Browser SDK** (`@brain/sdk-tracking-web`, the "pixel"): write-key init; autocapture page/session + explicit
  `track/identify`; **batch+retry+offline buffer**; `sendBeacon` on unload; generate `eventId`; read
  `_fbp/_fbc/gclid`; **consent-gated** (queue→replay on grant); persist `anonymousId` (first-party cookie +
  localStorage); write `anonymousId` to Shopify cart attributes.
- **Shopify Web Pixel** app extension: strict-sandbox Web Worker; `analytics.subscribe('all_events')` → `fetch`
  to collector; honor `customerPrivacy` natively.
- **Server SDK** (`@brain/sdk-server-events`, Node + Python): stateless, explicit identity, idempotent batch,
  ad-blocker-resilient — for orders/payments/critical events.
- **Mobile:** contracts + envelope now; native later (not blocked).

---

## 9. Scalability Strategy

Stateless autoscaled collector (one durable Kafka write → `202`); partition key `brand_id`(:`user` for whales,
salt outliers); **effective exactly-once** = Kafka idempotent producers (`acks=all`) + `messageId` dedup (Redis
TTL + `ReplacingMergeTree`); processing lean Node/Python → **Flink** (event-time/watermarks/RocksDB EOS) at
scale; ClickHouse TTL hot→S3 cold tiering with Iceberg as rebuildable SoR; **per-region clusters** (residency),
aggregated-only cross-region; pre-warm for sale days, shed non-critical analytics first.

---

## 10. Privacy & Compliance Strategy

Consent on every event, enforced server-side at ingest (**suppress / transform / route**); versioned consent
timeline applied contemporaneously; IAB TCF 2.2 + Google **Consent Mode v2**; GDPR opt-in / CCPA opt-out+GPC.
Durable identity via **server-set first-party HttpOnly cookies on same origin/IP** (else Safari re-caps 7d);
**fingerprinting is a non-strategy**. **Right-to-delete across hot+cold:** resolve identity graph → tombstone
→ hard-delete hot → **crypto-shred** cold (Iceberg/ClickHouse/backups) → propagate to vendors → immutable
proof-of-deletion. PII only as salted hashes at rest (SHA-256 for CAPI matching); **never log PII**; geo at
city/pincode. Brand-scoped RLS + per-region storage; **identities never cross brands**.

---

## 11. Edge-Case Handling Matrix

| Edge case | Handling |
|---|---|
| Ad blockers | Server-side + first-party collector; Shopify web-pixel `fetch`; webhooks = ground truth |
| Safari ITP | Server-set HttpOnly first-party cookie (same-origin/IP); durable server-side id; no reliance on JS cookies |
| Firefox ETP / Chrome | Same first-party strategy; design cookie-degraded (Chrome 3p cookies still on, mid-2026) |
| Cookie expiry | Durable server-side id keyed to identity graph; re-stitch on next known identifier |
| Session fragmentation | Sessionize on event-time + inactivity gap; stitch via shared identifiers |
| Login / logout | `identify` binds anon→known; logout starts new `anonymousId`, keeps customer link in graph |
| Multiple users / shared device | Cardinality limits + priority prevent collapse; `device_id`→many `customer_id` allowed, not chained |
| Duplicate events | `messageId` dedup (Redis TTL) + `ReplacingMergeTree`; vendor dedup via `eventId` |
| Late-arriving events | Event-time + watermarks + allowed-lateness; corrections to closed periods (45d realized tail) |
| Offline events | SDK offline buffer + retry; server stamps `receivedAt`, sequences by client `timestamp` |
| Network failures | At-least-once + idempotent dedup; client backoff; DLQ + replay |
| Mobile↔web stitching | Shared `customer_id`/email links device + cookie components |
| Cross-domain | First-party id via decorated links / server hand-off; collector normalizes |
| Multi-store journeys | Per-brand isolation default; cross-brand only via governed anonymized aggregation (opt-in) |
| Attribution conflicts | Single realized-revenue ledger as truth; model labelled per number; reconcile to orders |
| Missing identifiers | Degrade to anonymous profile; enrich on later identify; never block ingest |
| Consent changes over time | Versioned timeline; contemporaneous enforcement; downstream re-suppress + delete |

---

## 12. Operational Runbooks (outlines)
DLQ spike (classify→fix upstream→replay via secondary consumer, never auto-replay); replay/backfill (Iceberg
branch→reprocess→validate parity→fast-forward); mis-merge recovery (revoke edge→recompute→audit); erasure
(resolve graph→tombstone→delete hot→crypto-shred cold→propagate→proof); write-key compromise (rotate+grace→
revoke→alert); source outage (circuit-break→DLQ→backfill→mark degraded).

## 13. Monitoring & Observability
Ingest rate, accept/reject, dedup rate, **DLQ depth**, per-event-type lag, consumer offset vs head, replay
status (**freshness SLO < 1 min**); data-quality (schema-violation rate, identifier/consent presence,
completeness, identity match-rate, cardinality breaches) → integration-health surface, gates recommendations;
every log/trace carries `traceId`+`brand_id` (via `@brain/observability`), **never PII**; SLOs + burn-rate alerts.

## 14. Security Requirements
Write-key auth (brand-scoped, rotation/revoke, rate-limited, CORS allowlist); tenant isolation via
`@brain/access-control` (server-resolved `brand_id`, RLS, per-tenant dedup/cache keys, graphs never cross
brands); PII salted-hash at rest + SHA-256 for matching, TLS + KMS + vault; HMAC webhook verification +
idempotent UPSERT; payload caps + schema validation + quotas + bot filtering; data-derived instructions never
treated as permission (agentic-safety for downstream AI).

## 15. Implementation Roadmap (summary; full plan in companion doc)
| Phase | Delivers |
|---|---|
| **P1 Collection & Memory** | Edge collector, browser+server SDKs, Shopify web pixel, schema registry+validation, processor (normalize/enrich/sessionize), raw archive+replay, DLQ, deterministic identity + edge ledger, consent capture, isolation/contract/replay CI gates |
| **P2 Attribution & activation** | Journey builder, multi-touch + data-driven models, realized-revenue reconciliation, CAPI/Ads mirror+dedup, audiences foundation |
| **P3 Customer intelligence** | Customer 360, segmentation/audiences, consent enforcement on activation, lifecycle |
| **P4 Scale & graph** | Neo4j identity graph + probabilistic overlay, Flink processing, incrementality/MMM, multi-region residency |

Detailed milestones/tasks/exit-criteria: **`third-party-pixel-tracking-implementation-plan.md`**.

---

## 16. Assumptions Challenged & Risks (weaknesses)
1. **"First-party beats ITP" is only partly true** — server-set cookies need same-origin/IP, else Safari 16.4+
   re-caps to 7d. → run collector on the brand's true first-party origin (per-brand DNS/cert complexity) or accept degradation.
2. **Black-box data-driven MTA breaks <~2k conv/mo** (most DTC SMB tenants). → default rule-based + incrementality; gate data-driven on volume; don't oversell "AI attribution."
3. **Identity-graph collapse is the highest-severity bug** — cardinality limits must **fail closed**, load-tested with adversarial shared-device traffic before GA.
4. **Probabilistic stitching inflates match rates** + is a cross-tenant leak risk → labelled, optional, brand-disableable, never the anchor, strictly brand-scoped.
5. **"Real-time attribution" is marketing** — need 48–72h settlement; build realized-vs-placed honesty + freshness gate; never bill on placed.
6. **Cross-store journeys vs isolation tension** → default hard isolation; portfolio only via governed anonymized aggregation + opt-in + legal basis.
7. **Right-to-delete in immutable/columnar/backups is hard** → crypto-shredding + tombstoning designed in from day one (retrofitting is very expensive).
8. **Consent-change replays costly at scale** → versioned consent + targeted reprocessing, not full rebuilds.
9. **Vendor dedup is fragile** (`event_id` byte-identical client↔server) → centralize minting/reuse in SDK/collector; contract-test it.

---

## Sources (research corpus)
**Attribution:** Northbeam (Apex, server-side CAPI), Triple Whale Triple Pixel, RudderStack Shopify id-stitching,
LayerFive, Cometly, Black Crow AI, Improvado/Deducive/Attribuly. **Event CDPs:** Segment Spec (common/identify/
track/ecommerce-v2), Segment Unify identity-resolution (limits/priority/merge-protection) + Protocols,
RudderStack architecture/identity-stitching/warehouse-dedup, mParticle IDSync. **Enterprise:** Adobe XDM
(Individual Profile/ExperienceEvent/IdentityMap), Identity Service + graph-linking-rules, RTCDP, DULE; GA4 event
model, Measurement Protocol, Consent Mode v2, Enhanced Conversions, sGTM, BigQuery export. **Pixel/CAPI:** Meta
dedup (`event_id`+`event_name`) + `user_data` hashing + `fbp`/`fbc` + EMQ; Shopify Web Pixels (sandbox/standard
events/`customerPrivacy`); Google sGTM. **Lifecycle:** Klaviyo (identity precedence, `__kla_id`, events API,
consent); Customer.io (person model, anon merge window, subscription center). **Identity & privacy:** WebKit ITP,
Firefox ETP, Chrome Privacy Sandbox status (2024–25 reversal), server-set durable cookies, graph cardinality
(Segment/RudderStack/AEP), IAB TCF, Consent Mode v2, GDPR/CCPA right-to-delete, mParticle bulk deletion.
**Scale & methods:** Kafka EOS/idempotence, Confluent schema-registry compatibility, Flink vs Kafka-Streams vs
Spark, Iceberg branching/medallion, ClickHouse tiering, Markov removal-effect / Shapley, incrementality/geo-lift.
*(Full URLs retained in the underlying research briefs.)*
