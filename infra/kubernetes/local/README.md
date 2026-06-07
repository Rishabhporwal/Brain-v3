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
- ⏳ **M3b data layer (ClickHouse + Redpanda + Redis)**: ClickHouse needs `config.d/brain.xml` for the
  `brain_current_brand` row-policy setting; Redpanda for `integration.connected` + webhook ingest; Redis for cache.
- ⏳ **M4 AWS sim**: LocalStack (S3, Secrets Manager, KMS, SES) + External Secrets Operator → K8s Secrets.
- ⏳ **M5 observability in-cluster**: kube-prometheus-stack (Prometheus/Grafana) + Loki + Tempo; ServiceMonitor for the BFF.
- ⏳ **M6 GitOps**: ArgoCD app-of-apps (`../argocd/app-of-apps.yaml`) syncing every service Application from git.
- ⏳ **M7 web + ingress routing**: deploy web; ingress routes `/`, `/bff`, `/idp` like the Caddy single-origin.

## Run it
```bash
# create / delete the cluster
kind create cluster --config infra/kubernetes/local/kind-cluster.yaml
kind delete cluster --name brain-local

# deploy the BFF (after `docker build` of brain-bff:local — the compose stack builds it)
kind load docker-image brain-bff:local --name brain-local
helm upgrade --install bff infra/kubernetes/charts/brain-service \
  -f infra/kubernetes/local/values-bff.yaml -n brain --create-namespace

# verify
kubectl -n brain port-forward svc/api-gateway-bff 4599:4000 &
curl localhost:4599/health     # {"ok":true}

# ArgoCD UI (admin password)
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
kubectl -n argocd port-forward svc/argocd-server 8090:443   # https://localhost:8090
```

## Cost
**$0** — everything runs in Docker on your machine. Nothing is provisioned in AWS. When you're ready for
real AWS, the apply-ready Terraform lives in `infra/terraform/stacks/regions/ap-south-1/staging/` and the
same charts deploy to EKS (see `infra/DEPLOYMENT.md`).
