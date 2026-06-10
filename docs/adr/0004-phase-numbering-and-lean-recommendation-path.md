# ADR-0004: One phase vocabulary + the lean recommendation path — Accepted (2026-06-11)

## Problem
Three documents use three phase schemes: the BRD (Phases 1–5), the Solution Architecture
(Phases 0–4), and the Repository Architecture / service catalog (P1–P6). "P2" therefore means
different things depending on the document, which already produced real mismatches (consent
cataloged P3 vs needed in BRD Phase 1; agent services Solution-Arch Phase 0 vs catalog P5).

## Decision
1. **The catalog's P1–P6 is the only scheme used in manifests and engineering docs.** Mapping:

   | Catalog | BRD | Solution Architecture | Theme |
   |---|---|---|---|
   | P1 | Phase 1 | Phase 0 "Foundation" | Lean core: warehouse, connectors, tracking, metric engine, MCP access, billing floor |
   | P2 | Phase 1→2 | Phase 1 "Operator Wedge" | Split ingestion, identity, data-quality, ledger, high-frequency Home |
   | P3 | Phase 2–3 | Phase 2 "Lifecycle/AI CX" | CDP build-out, audiences, support, analytics depth |
   | P4 | Phase 3–4 | Phase 3 "Agentic" | AI platform, evaluation, full guardrail engine |
   | P5 | Phase 4 | Phase 3–4 | Activation + writeback, agent execution/reversal |
   | P6 | Phase 5 | Phase 4 "Scale/Enterprise" | GCC regions, enterprise, custom integrations |

2. **Lean recommendation path lands at P2, not P5.** BRD Phase 1–2 exit criteria ("top
   actions", Morning Brief) require ranked recommendations with confidence/staleness gates and
   decision-log writes. Full `agent-platform/{guardrail,execution,reversal}` stays P4/P5; until
   then a lean gate (staleness check from data-quality signals, confidence floor, approval-level
   tag, decision-log write) lives in the BFF/read-model path. Recorded as a Part-24 interim
   exception in the architecture doc.
   **Implemented (2026-06-11):** `api-gateway-bff/src/domain/recommendation-gate.ts` (pure,
   tested) + `application/{freshness,recommendation-gate}.service.ts` (ClickHouse per-stream lag,
   audit-log decision writes: recommendation.surfaced/withheld) + the integration-freshness
   endpoint. Kill switch: `RECOMMENDATIONS_KILL_SWITCH` env (per-brand config when governance lands).

3. When a manifest's phase conflicts with the Solution Architecture, the conflict is resolved
   here (or in a successor ADR), never silently in the manifest.
