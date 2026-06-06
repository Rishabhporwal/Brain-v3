# Brain — Platform Map (pods × platforms × phases)

The eight top-level platform directories are **fixed across Phase 1 → Phase 6**. Services are *filled in* per phase; the skeleton never reorganizes. Full design: [docs/Brain_Repository_Architecture.md](docs/Brain_Repository_Architecture.md).

| # | Platform directory | Owner pod(s) | Lands |
|---|---|---|---|
| ① | `apps/` — Product Applications (Next.js + RN/Expo) | Frontend | P1+ |
| ② | `platform-foundation/` — tenancy, identity, governance | Platform-Core | P1 |
| ③ | `first-party-data/` — tracking, events, identity resolution | Data Platform + Tracking | P1 |
| ④ | `connector-platform/` — registry + per-provider connectors | Integration | P1 (split P2/P6) |
| ⑤ | `commerce-intelligence/` — metric engine (only number source), ledger, attribution, Decision Log | Commerce + Platform-Core | P2 |
| ⑥ | `customer-intelligence/` — Customer 360, segments, audiences (CDP) | CDP + Growth | P3 |
| ⑦ | `agent-platform/` — orchestration (LangGraph) + guardrail/execution (Temporal) | Platform-Core + AI | P5 |
| ⑧ | `ai-platform/` — Feast/MLflow/BentoML models + agent runtimes (Python; advisory) | AI Platform | P4 |

**Supporting:** `shared-platform/` (region-adapter, llm-gateway, search, aggregation-zone) · `data-platform/` (Kafka/Flink/Spark/ClickHouse/Iceberg assets) · `contracts/` (single source of truth) · `libs/` + `py-libs/` (shared libs) · `sdks/` (tracking SDKs) · `infrastructure/` (Terraform/EKS/ArgoCD) · `deploy/` + `config/` · `docs/` · `tools/`.

**Satellites (separate repos):** `../brain-gitops` (ArgoCD desired-state) · `brain-sdk-{web,server,mobile}` (public SDK mirrors of `sdks/`).

## Phase fill order

| Platform | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| platform-foundation | ● all | | | | rbac→approval | enterprise-gov |
| first-party-data | ● core | reconciliation | | | | identity-graph (Neo4j) |
| connector-platform | registry + 9 conns | tiktok/crm/mkts | | | writeback | per-conn split, custom |
| commerce-intelligence | | ● metric/ledger/attr/decision-log | | incrementality/mmm, forecasting | decision-log full | mmm full, vendor |
| customer-intelligence | identity foundation | | ● all CDP | health ML overlay | activation rails | |
| agent-platform | | | | | ● all | |
| ai-platform | | | | ● MLOps + models | agents + memory | advanced MLOps |
| data-platform | streaming/lakehouse | flink/spark | journey/opensearch | feast/training | temporal | per-region + aggregation |
| infrastructure | India single-region | | opensearch | gpu/feast/mlflow | temporal | multi-region + neo4j |

Every service carries a `service.yaml` (owner pod, phase, SLOs, contracts, data owned) and a `README.md`. `tools/service-catalog/` reads all `service.yaml` files to drive the service catalog, CI deploy matrix, and on-call routing.
