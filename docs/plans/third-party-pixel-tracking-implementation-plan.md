# Third-Party Pixel Tracking & Customer Memory — Implementation Plan

Companion to **[third-party-pixel-tracking.md](./third-party-pixel-tracking.md)** (the design). This is the
end-to-end build plan: phased, mapped to Brain's existing code and the blueprint, with milestones, tasks,
exit criteria, and tests. **Everything reuses Brain's stack and the shipped Platform Foundation** — it does
not introduce a parallel architecture.

## Alignment recap (why this fits Brain)
- It **is** Blueprint Phase 1's *First-Party Data Platform + Event Collection Platform* (§2.10–2.11) + the
  *Customer Identity foundation* (§2.12), with attribution in Phase 2 — sequenced exactly as the roadmap.
- Reuses: Kafka/ClickHouse/Aurora-RLS/S3-Iceberg/Redis/NestJS+Python; the **already-designed** `event_platform.*`,
  `brain.*`, `identity.*`, `consent.*` schema; the shipped **`@brain/access-control`** tenancy seam +
  `isolation-gate` CI; the existing **webhook engine**, **`@brain/observability`**, and the MVP `TrackService`.
- Honors invariants: metric engine is the only number-producer (this module yields *events + identity*),
  realized-over-placed, region-adapters-not-forks, structural tenant isolation, lean-core phasing.

## Current foundations to build on (already in the repo)
- `platform/api-gateway-bff` MVP `TrackService` + `POST /api/track` (write-key → `brain.customer_events`).
- Schema substrate (unused): `tracking.tracking_keys`, `event_platform.{event_metadata,event_schema_versions,
  event_processing_checkpoint,event_offsets,event_dead_letter_queue}`; ClickHouse `brain.{raw_events,
  normalized_events,customer_events,sessions,event_processing_log,event_retry_log}` (partitioned, RLS).
- `identity.{customers,customer_identities,devices,identity_matches,identity_merge_history}` (RLS).
- Kafka producer infra (`infrastructure/messaging/events.ts`); `consent.*` schema; `@brain/access-control(-nest)`.

---

## Phase plan (aligned to Brain blueprint)

| Phase | Outcome | Blueprint tie |
|---|---|---|
| **P1 — Collection & Customer Memory foundation** | Reliable, validated, replayable hybrid ingestion + deterministic identity + consent capture; unified customer/commerce/marketing events on foundational dashboards | Phase 1 §2.10–2.12 |
| **P2 — Attribution & activation** | Journeys, multi-touch + data-driven attribution reconciled to realized revenue; CAPI/Ads mirror; audiences foundation | Phase 2 |
| **P3 — Customer intelligence** | Customer 360, segmentation/audiences, consent **enforcement** on activation, lifecycle | Phase 3 |
| **P4 — Scale & identity graph** | Neo4j graph + probabilistic overlay, Flink processing, incrementality/MMM, multi-region residency | Phase 4/6 |

Below: **P1 in milestone detail** (the focus); P2–P4 as scoped outlines.

---

## P1 milestones (each: independently shippable, tested, tenant-isolated)

### M0 — Foundations & contracts (enabling)
- Create packages: `shared/ts/event-contracts` (canonical envelope + e-commerce event types, Zod/JSON-Schema),
  `packages/sdks/tracking-web`, `packages/sdks/server-events`.
- Seed `event_platform.event_schema_versions` with JSON-Schema per event subject; `event_metadata` rows
  (routing/retention/erasure/PII/consent-purpose).
- Kafka topics: `brain.raw.events`, `brain.normalized.events`, `brain.events.dlq`, `brain.identity.merges`
  (partition key `brand_id`).
- **Exit:** contracts compile + published; schema registry seeded; topics created in local compose + IaC.

### M1 — Edge Collector (ingestion hardening) — *critical path*
- New `event-ingestion` service (or harden BFF `TrackService` behind the same seam): `POST /v1/track`,
  `/v1/batch`, `/v1/identify`, `/v1/page`, `/v1/alias`, `GET /v1/health`.
- Write-key auth → `brand_id` (+ **rotation/grace/revoke**); CORS allowlist; **token-bucket rate limit** per key.
- Envelope validation; **dedup** on `messageId` (Redis `tenantId:messageId`, TTL 7d); set/echo `eventId`;
  capture `fbp/fbc/gclid/IP/UA`; **consent gate** (drop/queue per consent).
- Append immutable **`brain.raw_events`** + S3/Iceberg Bronze; publish to `brain.raw.events`. `202`; bad → DLQ.
- **Tests:** unit (envelope/dedup/write-key/consent), contract (envelope+subjects), DLQ-on-malformed, rate-limit,
  isolation (brand A cannot ingest as B). **Exit:** durable, validated, deduped, replayable ingest live.

### M2 — Event Processor (normalize/enrich/sessionize) — *critical path*
- Consumer of `brain.raw.events`: normalize (region rules via Region Adapter) → enrich (geo city/pincode,
  device, campaign/click-ids) → **schema-validate** (registry, fail-closed) → **identity resolve** (M4 hook) →
  **sessionize** → write `brain.normalized_events` + `brain.customer_events`(ReplacingMergeTree) + `sessions`;
  checkpoint via `event_processing_checkpoint`/`event_offsets`.
- Lean Node/Python consumer now (Flink is the P4 target on the same topics).
- **Tests:** golden normalize/enrich, idempotency (double-deliver → one row), **replay parity** (rebuild from
  raw = byte-identical), late/out-of-order handling. **Exit:** events flow raw→derived, replayable.

### M3 — Browser SDK (the "pixel") + Shopify Web Pixel
- `@brain/sdk-tracking-web`: write-key init, autocapture page/session + `track/identify`, batch+retry+**offline
  buffer**, `sendBeacon` on unload, generate `eventId`, read `_fbp/_fbc/gclid`, **consent-gated** (queue→replay),
  persist `anonymousId` (cookie+localStorage), write `anonymousId` to **Shopify cart attributes**.
- Shopify **Web Pixel app extension**: strict-sandbox worker, `analytics.subscribe('all_events')`→`fetch` to
  collector, honor `customerPrivacy`. Onboarding step-4 snippet wires this.
- **Tests:** SDK unit (batching/retry/consent/offline), e2e capture → collector → `customer_events`. **Exit:**
  a brand installs the snippet and sees its events.

### M4 — Identity Resolution (deterministic + edge ledger)
- `Identity Resolution` service/module: build/maintain the graph in Aurora (`identity.customers` +
  `customer_identities` + **new `identity.identity_edges`** append-only ledger); deterministic stitch by trust
  priority; **cardinality limits + priority (fail closed)**; anonymous→known on identify (cart-token + login);
  merge/split as audited append-only events on `brain.identity.merges`.
- **Tests:** anon→known stitch, shared-device/library adversarial (no collapse), merge **reversibility/undo**,
  cardinality-breach fail-closed, cross-brand isolation. **Exit:** a returning/known customer is one profile;
  merges auditable + undoable.

### M5 — Server SDK + webhook normalization
- `@brain/sdk-server-events` (Node + Python): stateless, explicit identity, idempotent batch.
- `POST /v1/webhooks/:provider/:brandId` (reuse webhook engine): HMAC-verify, dedup, normalize to canonical
  events (Shopify orders/refunds = realized-revenue ground truth). **Exit:** server + webhook events unified
  with client events.

### M6 — DLQ, replay, consent capture & quality
- DLQ handling (Aurora index + CH body) + operator replay (secondary consumer; never auto-replay); **replay/
  backfill** from Iceberg (branch→reprocess→parity→fast-forward); **consent capture** on every event +
  versioned timeline; event-quality signals (freshness, schema-violation, identifier/consent presence,
  completeness, match-rate) → integration-health surface; `tracking.verified` reads real events.
- **Exit:** quality monitored; derived stores rebuildable; consent recorded.

### P1 CI gates (extend `isolation-gate`)
Isolation (no cross-brand ingest/read), contract (envelope+subjects), event-validation/DLQ, **replay-parity**,
identity (no collapse, reversible merge), consent-suppression — all release-blocking.

### P1 exit criteria (Blueprint §2.22 tracking subset)
SDK captures all events with acceptable identity-match and **zero schema-violation leakage past the DLQ**;
events durable + replayable + rebuildable; deterministic identity unifies anon→known; consent captured;
unified customer/commerce/marketing data on foundational dashboards over reconciled source facts; all gates green.

---

## P2–P4 outlines

- **P2 Attribution & activation:** journey builder (`touchpoints`/`journeys`); rule-based + data-driven (Markov/
  Shapley, Python) reconciled to the realized-revenue ledger; CAPI/GA4 **mirror** (shared `eventId` dedup,
  SHA-256 user-data); audiences foundation; realized-vs-placed honesty + data-quality gate.
- **P3 Customer intelligence:** Customer 360, RFM/segmentation, reusable audiences, **consent enforcement on
  activation** (suppress/transform/route), lifecycle foundation.
- **P4 Scale & graph:** Neo4j identity graph + labelled probabilistic overlay; Flink (event-time/watermarks/EOS);
  incrementality (geo/holdout) + MMM foundation; multi-region per-residency clusters + governed aggregation zone.

---

## Workstreams, sequencing & effort (P1)
Critical path: **M0 → M1 → M2** (durable validated processed ingest), then **M3/M4/M5 in parallel**, then **M6**.
Rough order-of-magnitude: M0 ~1wk · M1 ~1.5wk · M2 ~1.5wk · M3 ~1.5wk · M4 ~2wk · M5 ~1wk · M6 ~1wk →
**~8–9 engineer-weeks** for one pod (Data Platform + Identity/SDK), excluding the SDK polish + Shopify app review.

## Key risks → mitigations (see design §16)
First-party/ITP same-origin requirement → per-brand first-party origin provisioning; identity-graph collapse →
fail-closed cardinality + adversarial load test before GA; deletion across immutable stores → crypto-shred +
tombstone designed into M1/M6; vendor dedup fragility → centralize `eventId` minting + contract test;
"real-time attribution" expectation → 48–72h settlement + realized-vs-placed honesty.

## Definition of done (module)
P1 exit criteria met + CI gates green; design deliverables 1–15 implemented or scheduled; `ACCESS_CONTROL`-style
isolation proven for the event/identity stores; runbooks (DLQ, replay, mis-merge, erasure, key-rotation) written;
observability dashboards live; the customer-memory spine is the queryable foundation attribution/CDP/AI build on.
