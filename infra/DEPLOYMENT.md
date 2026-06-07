# Brain — Production Deployment & IaC Plan

> **Status (2026-06-07):** the production deploy path **does not exist yet** (audit blocker: DevOps score 24).
> This document is the concrete, sized plan to build it. The reviewable starting artifacts now in-repo:
> a Helm base chart (`infra/kubernetes/charts/brain-service`), the ArgoCD app-of-apps
> (`infra/kubernetes/argocd/app-of-apps.yaml`), and a default-deny NetworkPolicy baseline
> (`infra/security/network-policies/`). **Terraform is still skeleton** — it needs an AWS account to author
> and apply against (you cannot `terraform plan` without credentials + a state backend).

## Target (per Solution Architecture §13)
AWS · EKS (Karpenter autoscaling) · Aurora PostgreSQL (per region) · MSK (Kafka) · ElastiCache (Redis) ·
ClickHouse (managed or self-hosted on EKS) · S3 (raw/lakehouse) · SES (email) · Secrets Manager + KMS ·
CloudFront + WAF + ALB · ArgoCD (GitOps) · OTel/Prometheus/Grafana/Loki/Tempo. India launch region first.

## Deploy flow
```
GitHub Actions: build → test → scan (trivy/gitleaks) → push image to ECR (tag=git sha)
        │
Terraform (per region/env): VPC → EKS → RDS/MSK/ElastiCache/S3 → IAM (IRSA) → Secrets Manager → ACM/WAF
        │
ArgoCD (in-cluster): app-of-apps → one Application per service → Helm (brain-service chart + values-<svc>)
        │
External Secrets Operator: AWS Secrets Manager → K8s Secrets (no secrets in git/images)
```

## Terraform modules to author (each = the empty `infra/terraform/...` dirs today)
| Module | Contents | Effort |
|---|---|---|
| `network` | VPC, subnets (public/private), NAT, route tables, endpoints | M |
| `eks` | cluster, node groups/Karpenter, OIDC provider (IRSA), aws-auth | L |
| `data-aurora` | Aurora PG cluster, params, RLS-ready, **non-superuser app login role**, subnet/SG | M |
| `data-msk` | MSK cluster, topics bootstrap, SASL/IAM auth | M |
| `data-elasticache` | Redis (read-buffer/idempotency/rate-limit) | S |
| `data-clickhouse` | managed CH or EKS statefulset + EBS | L |
| `storage-s3` | raw/lakehouse buckets, lifecycle, encryption (KMS) | S |
| `edge` | ACM, CloudFront, WAF, ALB/ingress | M |
| `secrets-kms` | KMS keys (per-tenant option), Secrets Manager entries, IAM | M |
| `observability` | Managed Prometheus/Grafana or self-hosted + Loki/Tempo | M |

Layout already scaffolded: `infra/terraform/modules/*`, `stacks/regions/<region>/<env>/`, `backends/` (remote
state = S3 + DynamoDB lock). Six env profiles (local/dev/qa/uat/staging/production) × launch region (India).

## Sizing
Full IaC + cluster bring-up + GitOps + observability + the per-service Helm values is **~6–10 engineer-weeks**
for a DevOps/SRE pod, and **requires an AWS account from day one** to author and validate (no module can be
`plan`ned/`apply`d without it). This is the single largest remaining production blocker.

## What's reviewable/usable today (no AWS needed)
- `charts/brain-service` — every NestJS service deploys through this (probes, HPA, restricted securityContext,
  IRSA SA, Prometheus scrape annotations, secrets via envFrom). Lint with `helm lint` once helm is installed.
- `argocd/app-of-apps.yaml` — the GitOps root.
- `security/network-policies/default-deny.yaml` — zero-trust east-west baseline.
