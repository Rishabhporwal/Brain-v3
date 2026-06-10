# Agent Platform — orchestration (LangGraph) + guardrailed execution (Temporal). Phase 5.

No services are live yet. The landscape — `orchestrator`, `guardrail`, `approval`,
`execution`, `reversal`, `outcome-tracking`, `learning-loop` — lives as manifests in
[`tools/service-catalog/agent-platform/`](../tools/service-catalog/agent-platform/).
Per-discipline reasoning runtimes live in `ai-platform/agents/*` (also cataloged).

Pattern: `recommend → guardrail → (approve) → execute → track → learn`; every execute
registers a Temporal compensation. Money-moving paths require `@brain/security` co-sign
(see CODEOWNERS — entries are kept even while the paths are catalog-only).
