# Solution Architecture — delta for v1.1 (to fold into the next .docx revision)

**Status:** drafted 2026-06-11 from the BRD coverage review (Engineering Advisor + Architect).
The .docx (v1.0) is the source-of-truth narrative; these are the approved corrections to
incorporate. Until folded in, this file + ADR-0004 + the service catalog are authoritative
where they extend v1.0.

## 1. §4.2 Shared Platform — add two services

| Service | Owns / Responsibility | Phase |
|---|---|---|
| **Billing** | Realized-GMV-% invoicing above per-tier minimum monthly fee; CM2 affordability cap (lower-of rule); Day-0–14 activation period before first invoice; per-brand cost-to-serve metering (BRD §23). Consumes realized GMV + CM2 from the metric engine / realized-revenue ledger — never computes its own numbers. Money-moving: Security co-sign. | 0 (fee floor + activation); GMV-% when the ledger lands |
| **MCP Access** | Customer-facing MCP server hosted **inside the BFF edge** (one edge, not two): programmatic access to a brand's own warehouse via the read-model/metric-engine seam, under the same SSO/RBAC/tenant-isolation/consent rules as the console; every access audit-logged. Read tools first; write tools gated like any action. (BRD §5.1 "MCP Access", §8.10, §10.10.) | 0 — a Phase-1 (BRD) exit criterion |

## 2. §11 Operator Experience — add one bullet

- **MCP access** — the brand's own warehouse, queryable programmatically on the customer's
  terms (their tools, their agents), with the same trusted figures, isolation, and consent
  rules as every other surface. The warehouse is the deliverable (BRD §10.1); MCP is how the
  customer holds it.

## 3. §14 Delivery Roadmap — Foundation row, amend "Delivers"

Append: "…; **MCP server over the brand warehouse; billing floor (minimum fee + activation
period)**." (Both are BRD Phase-1 exit criteria; v1.0 omitted them.)

## 4. Phase vocabulary

v1.0 uses Phases 0–4; the BRD uses 1–5; the repository/catalog uses P1–P6. The reconciliation
table is **ADR-0004** (`docs/adr/0004-phase-numbering-and-lean-recommendation-path.md`); the
next docx revision should reference it rather than restate phases.

## 5. §9 Intelligence — lean recommendation path (clarification)

v1.0 places Agent Orchestrator/Guardrail/Execution in Phase 0, while the catalog ships the
full agent platform at P4/P5. Resolution (ADR-0004): a **lean recommendation path** —
ranked top actions with confidence/staleness gates and Decision-Log writes, enforced in the
BFF/read-model path — lands at catalog P2 to satisfy BRD Phase 1–2 "top actions" / Morning
Brief; the full guardrail engine, Temporal execution, and reversal arrive P4/P5. Consent
enforcement is P1 (capture-time stamping + send-time checks), per BRD §10.2/§27.4.

## 6. §4.2 Domain Services — no change needed for Lifecycle

Lifecycle was already correctly listed (Phase 1, "margin-gated campaigns and WhatsApp
journeys; offer governance"); it was missing from the repository catalog, now fixed at
`commerce-intelligence/domain-services/lifecycle`.
