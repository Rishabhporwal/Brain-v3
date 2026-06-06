# Onboarding → Production-Grade — Implementation Plan

**Scope assumption:** this plan hardens the **7-step onboarding** from "works with dev-stubs" to production-real.
If you meant a broader platform plan instead, say so and I'll re-scope. Owner surfaces: `apps/web-founder-console`
(wizard) + `platform-foundation/api-gateway-bff` (BFF) + `data-platform` (DB/CH).

## Current state (what's real vs dev-stub)

| Area | Today | Gap to production |
|---|---|---|
| Org/Brand create (provisioning) | ✅ real (Postgres + membership) | — |
| Cost configuration | ✅ real (`commerce.cost_config`) | richer cost model (per-SKU/category) is Phase-2+ |
| Tracking key issuance | ✅ real (`tracking.tracking_keys` + snippet) | — |
| **Tracking verification** | ✅ M1: queries ClickHouse for ≥1 real event before marking verified | — |
| First-party event ingest | ✅ M1: `POST /api/track` (write-key auth) → `brain.customer_events` | — |
| **Integration connect** | ✅ M3: real Shopify auth-code OAuth (HMAC+signed-state) → AES-GCM vault; dev-stub fallback when creds unset | richer connectors are later work |
| Activation gate | ✅ real (requires verified tracking) | criteria reflect real events; richer rules |
| Event flow | ✅ `audit_logs` events + M4: also emitted to Redpanda (`brain.onboarding.events`, opt-in) | — |
| Browser click-through | ✅ M5: Playwright e2e (real Keycloak login, all 7 steps) | — |

## Goal

A new user signs in → walks all 7 steps → **installs the SDK that actually sends events**, **verifies against
real ingested data**, **connects a connector via real OAuth**, and **activates** — with an e2e test proving the
click-through and the gate.

## Milestones (prioritized; each independently shippable + verified)

### M1 — Real first-party tracking ingest + verification  ✅ DONE (verified via curl: verify-before=false/events:0 → POST /api/track 202 → verify-after=true/events:1 → activate passes; bad key → 401)
- **BFF**: `POST /api/track` (NO Keycloak guard; authenticated by the **write-key**) → resolve brand from
  `tracking.tracking_keys` → insert a `brain.customer_events` row in ClickHouse (scoped by `brain_current_brand`).
- **BFF**: `verifyTracking` now **queries ClickHouse** for ≥1 event for the brand; sets `verified_at` only if found,
  else returns `verified:false` (no false-positive).
- **Wizard**: snippet + a **"Send a test event"** affordance (fires `/api/track`) so verification has real data to find.
- **Verify**: issue key → `POST /api/track` → `verify` flips true → activation passes. (curl)

### M2 — Activation gate & validation hardening  ✅ DONE (verified: validate returns events/costCoverage/warnings/failures; activate w/o costs → 400 listing failures; w/ costs → 201 + soft integration warning; re-activate → idempotent alreadyActive)
- Validation reads real signals (events present, integration health, cost coverage %).
- Gate: tracking verified (hard) + cost configured (hard) + ≥1 integration (soft, warn). Emit `brand.activated`.
- Idempotent re-activation; clear 4xx messages per failed criterion.
- Wizard: fixed off-by-one that skipped the Validation step; checklist now renders real signals + failures/warnings and blocks advancing until `ready`.

### M3 — Real OAuth for a reference connector (Shopify)  ✅ DONE
- Server-side **auth-code** flow: `GET …/integrations/shopify/connect?shop=…` (guarded) → signed-state consent URL;
  `GET /api/integrations/shopify/callback` (public; auth = HMAC + signed state) → exchange code → **vault** the
  token (AES-256-GCM dev KMS shim; DB keeps only `integration.oauth_tokens.secret_ref`, never material) → set
  `integration.integrations.status='connected'` + audit `integration.connected` → 302 back to the wizard.
- Falls back to the dev-stub when `SHOPIFY_CLIENT_ID/SECRET` unset (flow still builds/runs). Env documented in
  `platform-foundation/api-gateway-bff/.env.example` + `deploy/local/compose/proxy.yml`.
- Wizard "Connect" (Shopify) asks for the store domain then hands the browser to consent; the return params
  (`?connected` / `?connect_error`) drive the result toast + connected badge.
- **Verified locally** end-to-end with a mock token endpoint (`SHOPIFY_TOKEN_URL`): connect→authorize URL with
  signed state; callback with **valid HMAC** → `connected=shopify` (integration connected, `secret_ref` row,
  token **encrypted** in the vault — access token not grep-able, file mode 0600); **bad HMAC** → `bad_hmac`;
  **tampered state** → `bad_state`; **bad shop domain** → `400`. e2e still green (no regression).
- Real Shopify (live creds + a public tunnel) is the only leg not locally verifiable; the flow + fallback are built.

### M4 — Emit onboarding events to the backbone  ✅ DONE
- **Redpanda** in `deploy/local/compose/infra.yml` (broker :19092, schema-registry :18081) + **Redpanda Console**
  (:8090). The BFF emits `organization.created … brand.activated` to `brain.onboarding.events` (keyed by brand)
  **in addition to** `audit_logs`, via an optional `EventBus` (`events.ts`): `KAFKA_BROKERS` set → kafkajs
  producer (connect-on-first-use, fire-and-forget so a broker outage never blocks a request); unset → **no-op**
  (local/CI unchanged). Payload = versioned JSON envelope (`schema_version:1`); Avro-via-registry is the prod upgrade.
- **Verified locally**: ran a full onboarding with `KAFKA_BROKERS=localhost:19092` → consumed exactly the 6
  expected events off the topic (high-watermark=6); confirmed the no-op fallback still serves onboarding with
  Kafka absent. Wired `KAFKA_BROKERS` into the proxy compose; documented in `.env.example`.
- *Note:* CI continues to exercise the **no-op** default (production-safe); enabling Kafka in CI is opt-in.

### M5 — Playwright e2e (close the "watched it complete" gap)  ✅ DONE
- `apps/web-founder-console/e2e/onboarding.spec.ts`: real Keycloak login (founder), drives all 7 steps —
  including the M1 Send-a-test-event → Verify loop and the M2 gate — and asserts redirect to
  `/w/<slug>/dashboard`. Verified locally (passes repeatably); ground truth confirmed in DB/CH:
  audit `brand.created→…→brand.activated`, key `verified_at` set, 1 `page_view` event in ClickHouse,
  brand `status=active`.
- `e2e/global-setup.ts` clears the founder's `provisioning` brands before each run for determinism
  (the wizard's resume feature would otherwise desync a fresh run after a partial one).
- Wired into CI: `.github/workflows/e2e-onboarding.yml` (compose-up infra → BFF → web → Playwright),
  triggered on PRs touching the wizard/BFF/data-platform/deploy paths + `workflow_dispatch`.

### M6 — Tests  ✅ DONE
- **Vitest** added to the BFF. Unit (DB-free, 18 tests): the activation-gate decision (`gate.ts`, extracted
  pure from `validate`), Shopify OAuth crypto (signed-state round-trip/tamper/expiry, callback HMAC
  accept/reject/missing/altered, configured-gating), and the vault (encrypt-at-rest, no plaintext on disk,
  round-trip). Integration (opt-in `RUN_DB_TESTS=1`): full provisioning→active against the live Postgres +
  ClickHouse, asserting the gate blocks then passes and re-activation is idempotent.
- `nest build` excludes `test/` + `*.spec.ts` (verified: no spec leaks into `dist/`).
- Wired into CI (`e2e-onboarding.yml`): unit tests run DB-free pre-build; integration runs against the live
  stack after the BFF is up.

## Status — ✅ ALL MILESTONES DONE
Built in order M1 → M2 → M5 → M3 → M6 → M4; each verified locally before the next. Two real-world legs remain
credential/infra-gated (and are built + falling back safely): **live** Shopify OAuth needs a real app
client id/secret + a public tunnel; the Kafka backbone is opt-in via `KAFKA_BROKERS` (no-op otherwise).

## Verification per milestone
Every milestone ends with: `tsc` + `next build` (frontend), `npm run build` (BFF), and a curl/e2e sequence that
proves the new behaviour (no stub shortcuts left in the path it claims to cover).
