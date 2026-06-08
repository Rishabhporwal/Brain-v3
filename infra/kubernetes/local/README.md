# Local Production-Parity (kind) — build & test the AWS stack locally, free

Mirror the AWS/EKS production architecture on **Kubernetes-in-Docker (kind)** so we can build → test →
get sign-off **before** spending on AWS. The **same Helm charts + ArgoCD manifests** deploy here and on EKS —
moving to AWS is a config change, not a rewrite.

## AWS → local mapping
| AWS (prod) | Local (this stack) |
|---|---|
| EKS | kind (1 control-plane + 2 workers) |
| ALB / CloudFront | ingress-nginx (host :8081 / :8444) |
| ArgoCD (GitOps) | ArgoCD in-cluster (same app-of-apps + chart) |
| Aurora PostgreSQL | PostgreSQL (in-cluster — milestone 3) |
| MSK (Kafka) | Redpanda (in-cluster — milestone 3) |
| ElastiCache | Redis (in-cluster — milestone 3) |
| ClickHouse | ClickHouse (in-cluster — milestone 3) |
| S3 / Secrets Manager / KMS / SES | LocalStack (milestone 4) |
| CloudWatch / Prom / Grafana / Loki / Tempo | Prometheus + Grafana + Loki + Tempo in-cluster (milestone 5) |

## Status
- ✅ **M1 cluster**: 3-node kind cluster (`kind-cluster.yaml`), ingress-nginx + ArgoCD installed & running.
- ✅ **M2 app deploy proven**: BFF deployed via the base Helm chart (`charts/brain-service` + `values-bff.yaml`);
  `/health` 200 + `/metrics` served in-cluster. The image → Helm → k8s path works.
- ✅ **M3a data layer (Postgres + Keycloak)**: `data/data-stores.yaml` deploys Postgres 16 + Keycloak 26 into
  the `brain` ns; canonical schema (60 tables) + seed (11 roles, 14 permissions, 7 connectors) applied; realm
  `brain` imported. BFF wired to in-cluster DSNs (`values-bff.yaml`). **End-to-end verified in kind**: direct-grant
  token → `POST /api/onboarding/complete` (writes org+brand+OWNER) → `/me` → `/context` → `/permissions` all 200/201.
  RLS isolation proven in-cluster (brand A↔B isolated, empty GUC fail-closed).
- ✅ **M3b data layer (ClickHouse + Redpanda + Redis)**: `data/data-stores-m3b.yaml` deploys ClickHouse 24
  (with `config.d/brain.xml` declaring the `brain_` custom-settings prefix so row policies read
  `getSetting('brain_current_brand')`) + Redpanda 24 (Kafka API `redpanda:9092`) + Redis 7. All 5 phase models
  applied: **35 tables, 28 row policies**, both Kafka-engine tables wired to Redpanda. CH row-policy isolation
  proven in-cluster (brand A↔B isolated; empty setting fail-closed — `toUUID('')` rejects the query). BFF wired
  (`CH_URL`, `KAFKA_BROKERS`) and confirmed reaching ClickHouse.
- ✅ **M4 AWS sim**: LocalStack (`aws/localstack.yaml`) runs S3 + Secrets Manager + KMS + SES for `ap-south-1`;
  a provision Job creates the staging resources (bucket `brain-staging-data-ap-south-1`, `alias/brain-staging`,
  secret `brain/staging/app`, SES sender). External Secrets Operator (`aws/external-secrets.yaml`) syncs
  `brain/staging/app` → K8s Secret `brain-app-secrets`; the BFF loads it via `envFrom` (`values-bff.yaml`
  `secretRefs`). **Proven end-to-end**: `PG_URL`/`VAULT_KEY` removed from inline env now resolve from the
  synced secret, and `/me` returns 200 (DB read works through the secret-sourced DSN). Only the controller
  endpoint env + IRSA differ from real AWS.
- ✅ **M5 observability in-cluster**:
  - ✅ **Metrics**: kube-prometheus-stack (`observability/kube-prometheus-values.yaml`) → Prometheus + Grafana
    (admin/brain12345). BFF `ServiceMonitor` (`observability/bff-servicemonitor.yaml`) **verified**:
    `up{service="api-gateway-bff"}=1` and `http_requests_total` ingested into Prometheus.
  - ✅ **Logs**: Loki + Promtail (`observability/loki-values.yaml`) **verified** — BFF structured JSON logs
    (with `traceId`) queryable via LogQL `{namespace="brain"} |= "api-gateway-bff"`. Loki registered as a
    Grafana datasource declaratively (`observability/loki-grafana-datasource.yaml`, picked up by the Grafana
    sidecar — Grafana now serves Prometheus + Loki + Alertmanager).
  - ⛔ **Traces (Tempo)**: deferred — the BFF carries `traceId` in structured logs but exports **no OTLP spans**,
    so Tempo would ingest nothing. Add Tempo once the BFF emits OpenTelemetry spans (see deferred-hardening backlog).
  - ⚠️ **Capacity note**: the full kube-prometheus-stack + Loki on a single laptop kind cluster strains the
    control plane (the API server timed out twice and the BFF restarted once under load). On EKS this is a
    non-issue; locally, consider scaling node-exporter/kube-state-metrics down or running observability in a
    separate profile if it keeps flapping.
- ✅ **M6 GitOps**: ArgoCD app-of-apps (`../argocd/app-of-apps.yaml`) → per-service Applications under
  `../platform/` (`api-gateway-bff.yaml`, `web-founder-console.yaml`), each rendering the `brain-service` base
  chart with its local values file via the `$values` multi-source ref. **Verified**: `brain-root` →
  `api-gateway-bff` + `web-founder-console` all **Synced/Healthy**, pulled live from the GitHub repo
  (public, no creds). The BFF was handed off from the manual `helm install` to ArgoCD ownership; the e2e
  smoke still passes through the GitOps-managed pod. `targetRevision` tracks the trunk (`master`) — feature
  branches merge to master → ArgoCD syncs. Same source local + EKS.
- ✅ **M7 web + ingress routing**: `web-founder-console` (Next.js) deployed via the same base chart
  (`values-web.yaml`). Single-origin ingress (`ingress.yaml`, mirrors the legacy Caddyfile) **verified** on
  host `:8081`: `/` → web (307 auth redirect), `/bff/health` → BFF `{"ok":true}` (prefix stripped),
  `/idp/realms/brain` → Keycloak realm JSON (prefix stripped). Full browser OAuth login (Keycloak hostname
  config + two-issuer wiring) is deferred — out of scope for the routing-topology milestone.

## Run it
```bash
# create / delete the cluster
kind create cluster --config infra/kubernetes/local/kind-cluster.yaml
kind delete cluster --name brain-local

# deploy the BFF (after `docker build` of brain-bff:local — the compose stack builds it)
kind load docker-image brain-bff:local --name brain-local
helm upgrade --install bff infra/kubernetes/charts/brain-service \
  -f infra/kubernetes/local/values-bff.yaml -n brain --create-namespace

# M3 data layer (Postgres + Keycloak, then ClickHouse + Redpanda + Redis)
kubectl create configmap brain-realm-local -n brain \
  --from-file=brain-realm-local.json=infra/kubernetes/local/data/brain-realm-local.json
kubectl apply -f infra/kubernetes/local/data/data-stores.yaml
kubectl apply -f infra/kubernetes/local/data/data-stores-m3b.yaml
#   then apply canonical Postgres schema/seed + ClickHouse phase models (see commit history for the cat|psql / clickhouse-client one-liners)

# M4 AWS sim (LocalStack + External Secrets Operator)
kubectl apply -f infra/kubernetes/local/aws/localstack.yaml
helm upgrade --install external-secrets external-secrets/external-secrets -n external-secrets \
  --create-namespace --set installCRDs=true \
  --set 'extraEnv[0].name=AWS_SECRETSMANAGER_ENDPOINT' \
  --set 'extraEnv[0].value=http://localstack.brain.svc.cluster.local:4566'
kubectl apply -f infra/kubernetes/local/aws/external-secrets.yaml

# M5 observability (Prometheus + Grafana, then Loki)
helm upgrade --install kube-prom prometheus-community/kube-prometheus-stack -n monitoring --create-namespace \
  -f infra/kubernetes/local/observability/kube-prometheus-values.yaml
kubectl apply -f infra/kubernetes/local/observability/bff-servicemonitor.yaml
helm upgrade --install loki grafana/loki-stack -n monitoring \
  -f infra/kubernetes/local/observability/loki-values.yaml
kubectl apply -f infra/kubernetes/local/observability/loki-grafana-datasource.yaml   # Loki → Grafana

# M6 GitOps — hand the workloads to ArgoCD (pulls the pushed branch). Build/load the web image first
# so the chart's brain-web:local resolves locally (kind load, like the BFF).
docker build -f apps/web-founder-console/Dockerfile -t brain-web:local \
  --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:8081/bff \
  --build-arg NEXT_PUBLIC_APP_URL=http://localhost:8081 .
kind load docker-image brain-web:local --name brain-local
helm uninstall bff -n brain 2>/dev/null   # let ArgoCD own the BFF instead of the manual helm release
kubectl apply -f infra/kubernetes/argocd/app-of-apps.yaml          # brain-root → platform/*.yaml
kubectl -n argocd get applications -w                              # wait Synced/Healthy

# M7 single-origin ingress
kubectl apply -f infra/kubernetes/local/ingress.yaml

# verify
curl -H 'Host: localhost' localhost:8081/bff/health          # {"ok":true}
curl -H 'Host: localhost' localhost:8081/idp/realms/brain    # realm JSON
curl -so /dev/null -w '%{http_code}\n' -H 'Host: localhost' localhost:8081/   # 307 (web)
```

## Resume after a laptop reboot
The kind cluster's containers stop when Docker stops. After restarting:
```bash
# 1) Is the cluster still there? (kind containers usually auto-restart with Docker)
kind get clusters                       # expect: brain-local
kubectl config use-context kind-brain-local
kubectl get nodes                       # all Ready? give Docker ~1-2 min after login

#   If the cluster is gone, recreate from scratch (M1 → M5) using the "Run it" commands above,
#   then re-apply Postgres schema/seed + ClickHouse models (see commits 247de39 / 8b608f6).

# 2) Wait for the data + app pods, then re-run the e2e smoke (token → onboard → /me)
kubectl -n brain get pods
kubectl -n brain cp /tmp/e2e.js <bff-pod>:/tmp/e2e.js && kubectl -n brain exec <bff-pod> -- node /tmp/e2e.js

# 3) Finish M5: confirm Loki is Ready + ingesting BFF logs (LogQL: {namespace="brain"} |= "api-gateway-bff")
kubectl -n monitoring rollout status statefulset/loki
#   then continue with M6 (ArgoCD app-of-apps) and M7 (web + ingress single-origin routing).

# ArgoCD UI (admin password)
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
kubectl -n argocd port-forward svc/argocd-server 8090:443   # https://localhost:8090
```

## Cost
**$0** — everything runs in Docker on your machine. Nothing is provisioned in AWS. When you're ready for
real AWS, the apply-ready Terraform lives in `infra/terraform/stacks/regions/ap-south-1/staging/` and the
same charts deploy to EKS (see `infra/DEPLOYMENT.md`).
