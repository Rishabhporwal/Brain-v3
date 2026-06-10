# Security Review — fix-p0-audit-quickwins — VERDICT: PASS

Independent review (1 bounce, resolved). Diff = the 4 P0 remediations from the production-readiness audit.

| Fix | Verdict | Evidence |
|---|---|---|
| 1. ClickHouse row policies on live tables (orders/payments/ad_spend) | ✅ PASS | policy shape matches proven `phase1.sql`; INSERT (Kafka MV) unaffected; proven live: matching brand→1 row, other brand→0 |
| 2. NULLIF fail-closed on all nullable-brand RLS policies | ✅ PASS (after bounce-fix) | initial diff missed `schema/phase2/50_goals_replay.sql:41-42,61-62`; now fixed. Completeness gate `grep current_setting(...)::uuid \| grep -v NULLIF` → NONE |
| 3. Fail-closed signing secrets (no known 'dev' key; BRAIN_ENV prod signal) | ✅ PASS | no `?? 'dev'` remains; `signingSecret` throws in prod, ephemeral in dev; `timingSafeEqual` verify fails closed |
| 4. CORS allowlist + global ThrottlerGuard | ✅ PASS | no `origin:true` in prod; throttler added as APP_GUARD; auth guards (Keycloak/BrandContext/Permission) unaffected |

**New issues introduced:** none.
**Bounce history:** 1 (Fix 2 incomplete — missed phase2 subdir) → re-fixed → re-verified via completeness grep + full suite.
**Residual (follow-ups, NOT blockers):** throttler is a single generous global (600/min) — needs per-route tuning (looser/exempt `/track`+webhooks, tighter on auth/refund).
