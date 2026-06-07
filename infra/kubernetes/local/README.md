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
