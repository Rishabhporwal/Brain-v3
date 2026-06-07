# First-Party Data Platform — Implementation Plan

Phase-1 capability per **Blueprint §2.10–2.11** (First-Party Data Platform + Event Collection Platform) and
**Solution Architecture §5–6** (Ingestion, Streaming). This plan turns the current MVP ingest into the full
first-party tracking platform: browser + server SDKs, an authenticated ingestion API, a schema registry with
validation/versioning, a normalize→enrich pipeline, raw archive, replay, and DLQs — all tenant-isolated.

> **Invariant:** every event is consent-stamped and region-stamped **at capture**, carries the workspace key
> (`brand_id`) and resolvable identifiers, and flows on a `brand_id`-keyed topic. No PII in logs. Phase-1
> presents only **directly-captured facts** — no derived margin/attribution (that's Phase 2).

---

## 1. Scope

**In scope (Phase 1):** browser SDK + server-side SDK; ingestion API (write-key auth, batch, dedup);
event schema registry + validation + versioning; normalize/enrich processing; raw event archive; event
replay; per-pipeline DLQs; connector-health/event-quality signals; identity-stitch hook (deterministic).
Mobile SDK **contracts** only (native impl later, not blocked).

**Out of scope:** attribution/margin/metric engine (Phase 2); probabilistic identity + Neo4j (Phase 4/6);
the full Flink/Spark managed runtime (Phase 1 ships a lean processor — see §6 M5).

## 2. Current state & gap

**Already built**
- MVP ingest: `TrackService.ingest` + `POST /api/track` (write-key via `x-brain-key`) → writes **directly** to
  `brain.customer_events` (ClickHouse). Write-key issuance/verify in onboarding (`tracking_keys`).
- **Schema substrate is fully designed** (just unused): `tracking.tracking_keys`,
  `event_platform.{event_metadata, event_schema_versions, event_processing_checkpoint, event_offsets,
  event_dead_letter_queue}`; ClickHouse `brain.{customer_events, sessions, raw_events, normalized_events,
  event_processing_log, event_retry_log}` — all partitioned, with `brand_id` row policies.
- Kafka producer infra (`infrastructure/messaging/events.ts`) with `brain.integration.*` topics.

**Gaps to close**
| # | Gap |
|---|---|
| G1 | Ingest bypasses `raw.events` Kafka + `raw_events` archive → no replay, no exactly-once, no DLQ |
| G2 | No batch endpoint, no dedup (`event_id`/dedupe key), no rate limiting |
| G3 | No schema registry use → no validation/versioning; malformed events silently accepted |
| G4 | No normalize/enrich pipeline (region rules, geo, device, campaign IDs) → only `customer_events` written, not `raw_events`/`normalized_events` |
| G5 | No SDKs (`packages/sdks/*` empty); no autocapture |
| G6 | No DLQ handling / replay / event-quality surface |
| G7 | No identity-stitch hook (anonymous→known) |

## 3. Target architecture & flow

```
Browser SDK ─┐
             ├─(write-key, batch, consent)─▶ Ingestion API ──▶ Kafka brain.raw.events (key=brand_id)
Server SDK ──┘                               (validate envelope,        │
                                              dedup, archive raw)        ▼
                                                              Event Processor (consumer)
                                                              normalize → enrich → validate(schema registry)
                                                                ├─ ok  ─▶ brain.normalized_events + brain.customer_events (+ sessions)
                                                                │          └─▶ identity-stitch hook
                                                                └─ bad ─▶ brain.event_dead_letter (+ Aurora DLQ index) ─▶ replay
                  raw archive ─▶ brain.raw_events (ClickHouse) + S3/Iceberg SoR ──▶ replay rebuilds derived stores
```

Two lanes, both `brand_id`-keyed: **ingest** (fast, durable, append raw) and **process** (normalize/enrich/route).
Surfaces read `customer_events`; the metric engine (Phase 2) reads from here.

## 4. Data model (reuse what exists; additions noted)

- **`tracking.tracking_keys`** — add `last_seen_at`, support **rotation** (issue new, grace-window old).
- **`event_platform.event_schema_versions`** — populate: one **subject** per event type, JSON Schema `schema_def`,
  monotonic `version`, `status`. The validator pins compatible versions.
- **`event_platform.event_metadata`** — per event type: routing, retention class, erasure rule.
- **ClickHouse `brain.raw_events`** — write the **immutable source payload** on ingest (today skipped).
- **ClickHouse `brain.normalized_events`** — canonical, region-applied; same `event_id` for lineage.
- **`event_platform.event_dead_letter_queue`** (Aurora index) + **`brain.*` DLQ body** — invalid/failed events.
- **S3/Iceberg** raw archive — the system-of-record + replay source (can be deferred behind an interface; see §11).
- **Kafka topics (new):** `brain.raw.events`, `brain.normalized.events`, `brain.events.dlq` — partition key = `brand_id`.

## 5. Event taxonomy & envelope

**Tracked events (Blueprint §2.10):** Page View, Session Start, Product View, Collection View, Search,
Add To Cart, Remove From Cart, Checkout Started, Checkout Completed, Purchase, Custom.

**Canonical envelope (every event):**
```jsonc
{
  "event": "purchase",            // taxonomy or "custom"
  "schemaVersion": 1,
  "messageId": "uuid",            // client-generated → dedup key (exactly-once)
  "anonymousId": "uuid",          // device/cookie-less id
  "customerId": "string|null",    // when known
  "sessionId": "string|null",
  "ts": "ISO-8601",               // client time; server stamps received_at
  "consent": "granted|denied|...",// consent-stamped at capture
  "context": { "page": {...}, "device": {...}, "campaign": { "fbclid": "...", "gclid": "..." } },
  "props": { ... }                // event-specific (validated against the subject schema)
}
```
`brand_id` + `region` are resolved server-side from the **write-key** (never trusted from the client).
`messageId` drives dedup; `event_id` (server) is the lineage key across raw→normalized→customer_events.

## 6. Milestones (each independently shippable, tested, tenant-isolated)

- **M1 — Ingestion hardening.** Batch endpoint (`POST /api/track/batch`), write-key auth + **rotation**,
  envelope validation, **dedup** by `messageId`, append to `brain.raw_events`, publish to `brain.raw.events`
  Kafka, rate limiting (token bucket per write-key), `202` semantics. Out-of-envelope → DLQ, never 5xx the client.
- **M2 — Browser SDK** (`packages/sdks/tracking-web`, `@brain/sdk-tracking-web`). Init with write-key; autocapture
  page/session + explicit `track()/identify()`; **batching + retry + offline buffer**; consent gate; `sendBeacon`
  on unload. Ships a `<script>` snippet (onboarding step 4 already references this).
- **M3 — Server-side SDK** (`@brain/sdk-server-events`) — server-to-server capture, resilient to ad-blockers; same envelope.
- **M4 — Schema registry + validation + versioning.** Seed `event_schema_versions` (JSON Schema per subject);
  validator pins compatible versions; **producers fail closed** on incompatible; backward-compatible evolution rules.
- **M5 — Event processing pipeline.** Consumer of `brain.raw.events`: normalize (region rules: currency/tz),
  enrich (geo at city/pincode, device, campaign click-IDs), write `brain.normalized_events` + `brain.customer_events`
  (+ `sessions`), checkpoint via `event_processing_checkpoint`/`event_offsets`.
  *Phase-1 lean:* a NestJS/Node Kafka consumer (the architecture's Flink is the Phase-2+ target — same topics, swappable).
- **M6 — DLQ + replay + quality.** Per-pipeline DLQs (Aurora index + CH body); operator-visible; **replay** from
  `raw_events`/Iceberg to rebuild derived stores; event-quality signals (freshness, dedup rate, schema-violation
  rate, completeness) on the integration-health surface; verification (`tracking.verified`) reads real events.
- **M7 — Identity-stitch hook.** On known-identifier observation, link `anonymousId`→`customerId` (deterministic),
  feeding the Customer Identity foundation (separate workstream) — emit, don't resolve, here.

## 7. Tenant isolation & security
- Write-key → `brand_id` resolution server-side; client never supplies `brand_id`. Key **rotation** + revoke.
- `brand_id` on every event, Kafka message key, ClickHouse row (row policies via `brain_current_brand`), and log line.
- Consent + region stamped at capture; consent enforced before any downstream activation (Phase 3).
- **No PII in logs** (reuse `@brain/observability` redaction); geo at city/pincode, not full address.
- CORS allowlist for the browser SDK; per-write-key rate limits; payload size caps; reject on schema violation → DLQ.
- Ingestion API stays **write-key-authed and public** (not Keycloak) — it's cross-origin from the SDK.

## 8. Testing
- **Unit:** envelope parse, dedup, write-key resolution, consent/region stamping.
- **Contract:** the envelope + each subject schema (consumer-driven); schema-evolution compatibility tests.
- **Validation/DLQ:** malformed events land in DLQ, never in `customer_events`; replayable.
- **Replay:** rebuild `customer_events` from `raw_events` → byte-for-byte derived parity.
- **Isolation:** events for brand A never readable/writable under brand B (extend the existing isolation gate).
- **Load:** sustained ingest + spike (sale-day) within freshness SLO.

## 9. Observability & SLOs
- Orders/events fresh **< 1 min** (tracking) per architecture; dedup rate, schema-violation rate, completeness score.
- Per-event-type processing lag + DLQ depth; burn-rate alerts. All traces carry `traceId` + `brand_id`.

## 10. Rollout & rough effort
M1 (1–1.5 wk) → M4 (1 wk) → M5 (1.5 wk) → M2 (1.5 wk) → M3 (0.5 wk) → M6 (1 wk) → M7 (0.5 wk).
~7–8 engineer-weeks for one pod; M1+M4+M5 are the critical path (durable, validated, processed ingest).

## 11. Open decisions
1. **Processor runtime for Phase 1** — lean Node/Kafka consumer now (recommended) vs stand up Flink early.
2. **Raw archive** — S3/Iceberg now, or ClickHouse `raw_events` only + S3 behind an interface for later (recommended).
3. **Where ingestion lives** — extend the BFF `TrackService` now vs a dedicated `tracking`/`event-ingestion`
   service (Blueprint topology). Recommend: keep in BFF behind the same seam; extract when load justifies.
4. Mobile SDK timing (contracts now, native impl later).

## 12. Definition of done (mirrors Blueprint §2.22)
- SDK captures all specified events with acceptable identity-match and **zero schema-violation leakage past the DLQ**.
- Events durable + replayable; derived stores rebuildable from raw.
- Unified customer/commerce data renders on foundational dashboards over reconciled source facts.
- Event-quality monitored; isolation/contract/event/replay suites green in CI.
