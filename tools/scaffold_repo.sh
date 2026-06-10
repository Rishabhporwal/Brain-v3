#!/usr/bin/env bash
# Brain monorepo scaffolder — idempotent. Derived from docs/Brain_Repository_Architecture.md.
# Structure is fixed across Phase 1→6; near-term (P1/P2) services get full DDD/Python internals,
# later-phase services get a reserved directory + ownership manifest (service.yaml) + PHASE.md.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

gk() { mkdir -p "$1" && [ -e "$1/.gitkeep" ] || : > "$1/.gitkeep"; }   # keep empty dir
note() { printf '%s\n' "$2" > "$1"; }                                  # write one-line file if content given

# ---- service.yaml + README for any service -------------------------------------------------
svc_manifest() { # path name pod phase lang summary
  local p="$1" name="$2" pod="$3" phase="$4" lang="$5" summary="$6"
  mkdir -p "$p"
  cat > "$p/service.yaml" <<EOF
# Service manifest — machine-readable ownership / SLO / contract registry.
name: $name
owner_pod: $pod
phase: $phase
language: $lang
summary: >-
  $summary
slos:
  availability: "99.9%"
  latency_p99_ms: 250
contracts:
  consumes: []          # e.g. [proto/commerce/metric.proto, events/avro/order.normalized.avsc]
  produces: []
data_owned: []          # tables/topics this service owns (no shared tables — Blueprint §2.14)
on_call: $pod
EOF
  cat > "$p/README.md" <<EOF
# $name

**Platform:** $(dirname "$p") · **Owner:** \`$pod\` · **Phase:** $phase · **Language:** $lang

$summary

See [docs/Brain_Repository_Architecture.md](../../docs/Brain_Repository_Architecture.md) §20/§21 for the service template.
EOF
}

# ---- NestJS service (TS) ------------------------------------------------------------------
ts_service() { # platform service pod phase summary  [context]
  local platform="$1" service="$2" pod="$3" phase="$4" summary="$5" ctx="${6:-$2}"
  local p="$platform/$service"
  svc_manifest "$p" "$service" "$pod" "$phase" "nestjs-ts" "$summary"
  case "$phase" in
    P1|P2) # full DDD / Hexagonal / Clean / CQRS skeleton — canonical 8-folder src.
           # See docs/nestjs-service-template.md + tools/templates/nestjs-service.
      note "$p/Dockerfile" "# multi-stage NestJS build — see tools/templates/nestjs-service/Dockerfile"
      gk "$p/chart"
      for d in api/http api/consumers api/guards \
               application/commands application/queries application/ports application/dto \
               domain/model domain/events domain/services domain/errors \
               infrastructure/messaging infrastructure/clients infrastructure/secrets \
               persistence/repositories persistence/entities persistence/migrations \
               contracts/generated \
               config \
               ; do gk "$p/src/$d"; done
      for d in unit contract integration isolation e2e; do gk "$p/test/$d"; done
      note "$p/src/main.ts" "// composition root — bootstrap: OTel, config validation, health probes, graceful shutdown"
      ;;
    *) # reserved: dir + manifest + phase marker only
      gk "$p/src"
      note "$p/PHASE.md" "Reserved for $phase. Directory + ownership fixed now; internals scaffolded when the phase begins."
      ;;
  esac
}

# ---- Python AI service --------------------------------------------------------------------
py_service() { # platform service pod phase summary kind(service|agent|model)
  local platform="$1" service="$2" pod="$3" phase="$4" summary="$5" kind="${6:-service}"
  local p="$platform/$service"
  svc_manifest "$p" "$service" "$pod" "$phase" "python-fastapi" "$summary"
  if [ "$kind" = "service" ] && { [ "$phase" = "P4" ] || [ "$phase" = "P1" ]; }; then
    note "$p/Dockerfile" "# python serving image — see tools/generators/service-templates/python-ai"
    note "$p/pyproject.toml" "[project]
name = \"$service\"
version = \"0.1.0\"
requires-python = \">=3.12\""
    gk "$p/chart"
    for d in api/http api/grpc api/consumers \
             application/ports application/dto \
             domain/features domain/models domain/evaluation domain/policies \
             infrastructure/feast infrastructure/mlflow infrastructure/serving \
             infrastructure/llm infrastructure/messaging infrastructure/decision_log \
             ; do gk "$p/app/$d"; done
    for d in unit contract eval calibration integration; do gk "$p/tests/$d"; done
    note "$p/app/main.py" "# FastAPI app: OTel, config validation, health, /predict"
  else
    gk "$p/app"
    note "$p/PHASE.md" "Reserved for $phase ($kind). Ownership fixed now; internals scaffolded when the phase begins."
  fi
}

echo "▸ ① Product Applications"
for a in web-founder-console web-admin-console web-assistant; do
  gk "apps/$a/app"; gk "apps/$a/components"; gk "apps/$a/features"; gk "apps/$a/lib"; gk "apps/$a/e2e"
  note "apps/$a/README.md" "# $a — Next.js surface (Frontend pod). See architecture doc §6."
done
gk "apps/mobile/app"; gk "apps/mobile/features"; gk "apps/mobile/components"; gk "apps/mobile/lib"; gk "apps/mobile/e2e"
note "apps/mobile/README.md" "# mobile — React Native + Expo. Morning Brief = primary surface (Frontend pod)."
for pkg in design-system charts ui-web ui-mobile formatters bff-client feature-flags; do
  gk "apps/packages/$pkg/src"; note "apps/packages/$pkg/README.md" "# @brain/$pkg — shared UI library."
done

echo "▸ ② Platform Foundation"
ts_service platform api-gateway-bff   platform-core P1 "Edge: authn/z, routing, rate-limit, workspace resolution, read aggregation."
ts_service platform auth              platform-core P1 "Register/login/verify/reset; JWT+refresh; sessions; MFA-ready (Keycloak-backed)."
ts_service platform organization      platform-core P1 "Org lifecycle, settings, billing basis, cross-brand grants."
ts_service platform brand             platform-core P1 "Brand (=workspace) lifecycle; workspace-key minting; brand settings."
ts_service platform membership        platform-core P1 "User↔org↔brand mappings, invitations, activation, teams."
ts_service platform rbac              platform-core P1 "Brand/feature/API permissions; approval-matrix model (scaffold for P5)."
ts_service platform onboarding        platform-core P1 "7-step onboarding orchestration (org→brand→cost→tracking→integration→validate→activate)."
ts_service platform governance        platform-core P1 "IAM, role/approval enforcement, audit log."
ts_service platform audit             security      P1 "Immutable append-only audit trail (WORM/hash-chain)."
ts_service platform notification      platform-core P1 "Severity-routed alerts (in-product/mobile/email), quiet-hours."
ts_service platform configuration     platform-core P1 "Config service: DB/Kafka/Redis/Storage/OAuth/Integrations/Security/Flags."
gk platform-foundation/_shared
note platform-foundation/README.md "# Platform Foundation — tenancy, identity, governance (Platform-Core). Phase 1."
note platform-foundation/PHASE.md "All services Phase 1."

echo "▸ ③ First-Party Data Platform"
ts_service first-party-data tracking            tracking      P1 "Issues write keys; receives SDK + server-side events; first-line validation."
ts_service first-party-data event-ingestion     data-platform P1 "Authenticated ingest; dedupe; publish raw.events (workspace-keyed)."
ts_service first-party-data event-processing     data-platform P1 "Orchestrates Flink normalize→enrich→route pipeline."
ts_service first-party-data event-validation     data-platform P1 "Schema conformance, required identifiers, consent presence; DLQ routing."
ts_service first-party-data schema-registry-svc  data-platform P1 "Versioned event schemas; backward-compat evolution; producers fail-closed."
ts_service first-party-data event-replay         data-platform P1 "Rebuild derived stores from retained raw log."
ts_service first-party-data identity-resolution  cdp           P1 "Deterministic key matching in-stream; merge/split; auditable (Neo4j overlay P6)."
ts_service first-party-data data-quality         data-platform P1 "Freshness/dedupe/match/conformance/completeness → integration-health."
ts_service first-party-data reconciliation       data-platform P2 "Realization-tail corrections (with realized-revenue-ledger)."
gk first-party-data/_shared
note first-party-data/README.md "# First-Party Data Platform — tracking, events, identity resolution (Data + Tracking pods)."

echo "▸ ④ Connector Platform"
ts_service connector-platform registry integration P1 "Connector config, OAuth tokens (Secrets Manager), sync/retry state, health."
for kit in oauth webhook-engine sync-engine retry-engine rate-limiter health dlq writeback; do
  gk "connector-platform/_kit/$kit/src"; note "connector-platform/_kit/$kit/README.md" "# connector _kit: $kit"
done
# bash 3.2 (macOS) compatible: "name:phase" pairs
for pair in shopify:P1 meta-ads:P1 google-ads:P1 stripe:P1 razorpay:P1 shiprocket:P1 whatsapp:P1 \
            tiktok-ads:P2 crm-hubspot:P2 crm-salesforce:P2 marketplaces:P2 gcc:P6; do
  c="${pair%:*}"; ph="${pair#*:}"
  ts_service connector-platform/connectors "$c" integration "$ph" "Connector for $c: fetch, normalize, idempotent write-back."
done
gk connector-platform/connectors/_template/src
note connector-platform/connectors/_template/README.md "# cookiecutter for future connectors"
ts_service connector-platform custom-integration-framework integration P6 "Enterprise/custom connectors + light retail/POS ingestion."
note connector-platform/README.md "# Connector Platform — registry + per-provider services (Integration pod)."

echo "▸ ⑤ Commerce Intelligence"
ts_service commerce-intelligence metric-engine            platform-core P2 "Tier-0 deterministic CM1/CM2/CM3 + MER/CAC/RTO/COD; versioned formula registry. ONLY source of numbers." metric
ts_service commerce-intelligence realized-revenue-ledger  platform-core P2 "Financial golden record; stream state + ≤45d realization-tail reconciliation; append-only corrections." ledger
ts_service commerce-intelligence attribution              commerce      P2 "First/last/linear/position/data-driven, reconciled to realized ledger."
ts_service commerce-intelligence journey-builder          commerce      P2 "Sessions, touchpoints, ordered journeys."
ts_service commerce-intelligence analytics                commerce      P2 "Store/acquisition/lifecycle/product/logistics/finance metric assembly."
ts_service commerce-intelligence read-model-builder       platform-core P2 "CQRS pre-materialize Home/Brief/dashboard payloads (instant reads)."
ts_service commerce-intelligence dashboard-serving        commerce      P2 "Serves pre-materialized dashboards to the BFF."
ts_service commerce-intelligence executive-analytics      commerce      P2 "CEO/CMO/COO/CFO/CTO role views over one dataset."
ts_service commerce-intelligence decision-log             platform-core P2 "Append-only recommendation→outcome ledger (THE MOAT)."
ts_service commerce-intelligence incrementality           growth        P4 "Holdouts, lift, geo experiments (recovered-revenue proof)."
ts_service commerce-intelligence mmm                      ai-platform   P4 "Media-mix modelling foundation."
ts_service commerce-intelligence/domain-services logistics-rto operations P2 "NDR/courier/pincode intelligence, RTO cost, courier-switch actions."
ts_service commerce-intelligence/domain-services inventory     operations P2 "Real-time stock cover / days-of-cover."
ts_service commerce-intelligence/domain-services finance-cash  finance    P2 "P&L, settlement timing, refund liability, cash conversion, scenarios."
ts_service commerce-intelligence/domain-services forecasting   operations P4 "Demand forecasting orchestration (model in ai-platform)."
ts_service commerce-intelligence/domain-services procurement   operations P4 "Reorder / PO generation."
ts_service commerce-intelligence/domain-services vendor        operations P6 "Supplier/vendor management."
note commerce-intelligence/README.md "# Commerce Intelligence — metric engine is the only number source (Commerce + Platform-Core). Phase 2."

echo "▸ ⑥ Customer Intelligence (CDP)"
ts_service customer-intelligence customer-360        cdp    P3 "Unified profile from identity+profile+consent+behaviour."
ts_service customer-intelligence customer-profile    cdp    P3 "Attributes, traits, RFM/RFMC, commerce profile."
ts_service customer-intelligence consent             cdp    P3 "Channel/purpose/region consent, withdrawal, suppression; enforced on every send."
ts_service customer-intelligence segmentation        growth P3 "RFM/RFMC segments; deterministic-first at-risk/churn signals."
ts_service customer-intelligence audience            growth P3 "Reusable audiences (build-once); membership materialization; activation contracts."
ts_service customer-intelligence audience-activation growth P3 "Activate audiences to rails (consent + frequency checks)."
ts_service customer-intelligence journey-analytics   commerce P3 "Path-to-purchase, sequences, assists → realized revenue."
ts_service customer-intelligence customer-health     cdp    P3 "At-risk + churn-likelihood (heuristic; ML overlay P4)."
ts_service customer-intelligence search              cdp    P3 "Customer/order/ticket search (OpenSearch)."
ts_service customer-intelligence support-inbox       operations P3 "Classify/enrich/route tickets; support-to-commerce feedback."
note customer-intelligence/README.md "# Customer Intelligence (CDP) — Customer 360, segments, audiences (CDP + Growth). Phase 3."

echo "▸ ⑦ Agent Platform"
for s in orchestrator guardrail approval execution reversal outcome-tracking learning-loop; do
  ts_service agent-platform "$s" platform-core P5 "Agent platform: $s (guardrail/execution co-owned by Security)."
done
note agent-platform/README.md "# Agent Platform — orchestration (LangGraph) + guardrail/execution (Temporal). Phase 5. Reasoning runtimes live in ai-platform/agents."

echo "▸ ⑧ AI / ML Platform (Python)"
for s in feature-engineering feature-store model-training model-registry model-serving evaluation model-monitoring; do
  py_service ai-platform/services "$s" ai-platform P4 "AI/ML platform service: $s." service
done
for m in rto-prediction ltv churn demand-forecasting creative-fatigue budget-optimization data-driven-attribution; do
  gk "ai-platform/models/$m/training"; gk "ai-platform/models/$m/inference"; gk "ai-platform/models/$m/cards"
  note "ai-platform/models/$m/README.md" "# model: $m (P4). Advisory only; calibration band + deterministic fallback."
done
for a in _base marketing operations finance planning; do
  py_service ai-platform/agents "$a" ai-platform P5 "Per-discipline reasoning runtime: $a." agent
done
gk ai-platform/memory; note ai-platform/memory/README.md "# pgvector memory: Brand Fingerprint, condition-outcome, creative (P4→P5)."
gk ai-platform/pipelines
note ai-platform/README.md "# AI / ML Platform (Python) — Feast/MLflow/LangGraph/BentoML. Advisory; subordinate to deterministic core. Phase 4+."

echo "▸ Shared Platform services"
ts_service shared-platform region-adapter   platform-core P1 "Inject tax/consent/logistics/calendar/provider rules into every service."
ts_service shared-platform llm-gateway       ai-platform   P1 "Route prompts by complexity; enforce AI quotes computed figures only."
ts_service shared-platform notification-svc  platform-core P1 "Severity-routed alert delivery."
ts_service shared-platform search-svc        cdp           P3 "OpenSearch-backed search service."
ts_service shared-platform aggregation-zone  platform-core P6 "Governed cross-region aggregated/anonymized portfolio rollups."
note shared-platform/README.md "# Shared cross-cutting platform services."

echo "▸ Contracts (single source of truth)"
for d in proto/platform proto/commerce proto/cdp proto/agents proto/ai proto/connectors proto/common \
         events/avro events/asyncapi openapi temporal tracking metrics data-contracts security; do gk "contracts/$d"; done
cat > contracts/buf.yaml <<'EOF'
version: v2
modules:
  - path: proto
breaking:
  use: [FILE]
lint:
  use: [STANDARD]
EOF
note contracts/buf.gen.yaml "# buf codegen → TS (libs/contracts-ts) + Python (py-libs/contracts-py)"
note contracts/events/topics.yaml "# canonical topic registry: raw / normalized / attributed / signals / decisions (partition key = workspace_id)"
cat > contracts/metrics/registry.yaml <<'EOF'
# THE FORMULA BOOK — single source of truth for every metric (TS + Python generated from here).
# Only the metric-engine computes these; libs/metric-client + py-libs/metrics generate clients.
version: 1
metrics: []   # e.g. { id: cm2, formula_version: 1, definition: "...", inputs: [...] }
EOF
note contracts/README.md "# Contracts — single source of truth. buf breaking + contract tests + TS↔Py parity gate merges. See architecture doc §15."

echo "▸ Shared libs (TS + Python)"
for l in tenancy auth authz contracts-ts dto events temporal observability security region idempotency metric-client http config errors testing feature-flags; do
  gk "libs/$l/src"; note "libs/$l/package.json" "{ \"name\": \"@brain/$l\", \"version\": \"0.0.0\", \"private\": true }"
done
note libs/README.md "# Shared TypeScript libraries. libs/tenancy is a mandatory dep of every service."
for l in tenancy contracts-py metrics events observability llm features eval utils; do
  gk "py-libs/$l/src"; note "py-libs/$l/pyproject.toml" "[project]
name = \"brain-$l\"
version = \"0.0.0\""
done
note py-libs/README.md "# Shared Python libraries. py-libs/metrics enforces TS↔Python metric parity."

echo "▸ SDKs"
for s in browser server mobile core; do gk "sdks/$s/src"; note "sdks/$s/README.md" "# tracking SDK: $s (Tracking pod). Mirrored to brain-sdk-$s public repo."; done

echo "▸ Data Platform assets"
for d in contracts/events contracts/topics contracts/quality-rules \
         streaming/kafka/topics streaming/kafka/schema-registry \
         streaming/flink/jobs/normalizer streaming/flink/jobs/identity-resolver streaming/flink/jobs/journey-attribution streaming/flink/jobs/anomaly-detector streaming/flink/jobs/sale-event-mode \
         batch/spark/jobs/revenue-reconciliation batch/spark/jobs/historical-rebuilds batch/spark/jobs/backfills batch/spark/jobs/feature-materialization \
         warehouse/clickhouse/models warehouse/clickhouse/materialized-views warehouse/clickhouse/migrations \
         lakehouse/iceberg/tables lakehouse/iceberg/retention \
         stores/postgres stores/redis stores/opensearch stores/neo4j stores/pgvector replay; do
  gk "data-platform/$d"
done
note data-platform/README.md "# Data Platform assets — Kafka/Flink/Spark/ClickHouse/Iceberg (Data Platform pod)."

echo "▸ Infrastructure"
for m in vpc networking eks karpenter msk schema-registry aurora clickhouse redis-elasticache opensearch \
         s3-iceberg neo4j temporal keycloak feast mlflow kms secrets waf cloudfront api-gateway observability; do
  gk "infrastructure/terraform/modules/$m"
done
for reg in ap-south-1 me-central-1 me-south-1; do
  for env in dev qa uat staging production; do gk "infrastructure/terraform/stacks/regions/$reg/$env"; done
done
gk infrastructure/terraform/stacks/_global; gk infrastructure/terraform/backends
gk infrastructure/kubernetes/base; gk infrastructure/kubernetes/platform; gk infrastructure/kubernetes/argocd
for s in network-policies pod-security rbac-k8s kms-key-policies scanners; do gk "infrastructure/security/$s"; done
for o in otel prometheus grafana loki tempo; do gk "infrastructure/observability/$o"; done
note infrastructure/observability/runbooks-index.md "# alert → runbook mapping"
note infrastructure/README.md "# Infrastructure Platform — Terraform / EKS / ArgoCD / observability (DevOps-SRE pod)."

echo "▸ Deploy (local) + config"
gk deploy/local/compose; gk deploy/local/seed
cat > deploy/local/Makefile <<'EOF'
up: ; docker compose -f docker-compose.yml -f compose/infra.yml -f compose/services.yml up
EOF
cat > deploy/local/docker-compose.yml <<'EOF'
# Base local stack. Layered overrides in compose/{infra,services,ai,mocks}.yml
# `make -C deploy/local up` brings up the whole platform (BRD requirement: one command).
name: brain-local
services: {}
EOF
for f in infra services ai mocks; do note "deploy/local/compose/$f.yml" "# $f layer — see architecture doc §17A"; done
note deploy/local/bootstrap.sh "# keycloak realm, kafka topics, ClickHouse schemas, migrations"
gk config/_schema
for env in local dev qa uat staging production; do gk "config/$env"; done
for reg in ap-south-1 me-central-1 me-south-1; do gk "config/regions/$reg"; done
note config/README.md "# Environment config — no hardcoded values; validated at boot (architecture doc §18)."

echo "▸ Docs hierarchy"
for d in architecture architecture/c4 adr api runbooks operations onboarding security compliance disaster-recovery data-governance ai-governance program; do gk "docs/$d"; done
note docs/adr/0001-hybrid-monorepo.md "# ADR-0001: Hybrid Monorepo (Turborepo + pnpm + uv) — Accepted. See architecture doc §1."
note docs/adr/0002-turborepo-uv.md "# ADR-0002: Turborepo (TS) + uv (Python); Nx rejected, Bazel deferred to P6 — Accepted."
note docs/adr/0003-contracts-source-of-truth.md "# ADR-0003: /contracts is the single source of truth; buf breaking + TS↔Py parity gate — Accepted."

echo "▸ Tools"
gk tools/generators/service-templates/nestjs; gk tools/generators/service-templates/python-ai; gk tools/generators/service-templates/connector
gk tools/codegen; gk tools/ci; gk tools/scripts; gk tools/service-catalog
note tools/service-catalog/README.md "# reads every service.yaml → service catalog, CI deploy matrix, on-call routing."

echo "▸ GitHub Actions"
gk .github/actions; gk .github/workflows
for wf in pr contracts build-and-push gitops-bump metric-golden model-calibration isolation-gate security-scan mobile-eas nightly-soak; do
  note ".github/workflows/$wf.yml" "# $wf — see architecture doc §22"
done

echo "▸ brain-gitops satellite"
gk ../brain-gitops/projects; gk ../brain-gitops/applications; gk ../brain-gitops/values; gk ../brain-gitops/overlays/regions
note ../brain-gitops/README.md "# Brain GitOps (ArgoCD app-of-apps) — SEPARATE repo. CI writes image tags; ArgoCD reconciles."
note ../brain-gitops/app-of-apps.yaml "# root ArgoCD Application (app-of-apps)"

echo "✓ tree scaffolded"
