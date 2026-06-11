# Data Platform — ingestion, connectors, streaming (Data Platform pod)

**Live:**

- `connector-platform/` — the connector kit (`_kit/core`), the connector `registry`, and one
  deployable per live provider (`connectors/{shopify,meta-ads,google-ads,razorpay,woocommerce,stripe,shiprocket}`).
- `raw-archiver/` — raw-as-received archive of every integration topic to S3/MinIO
  (BRD §10.4: the warehouse keeps raw data exactly as received; Hive-partitioned
  `topic/brand_id/dt`, at-least-once, offsets committed only after the object is durable).

**Planned** (manifests in [`tools/service-catalog/data-platform/`](../tools/service-catalog/data-platform/)):

- `first-party-data/*` — tracking SDK lane, event ingestion/validation/processing/replay,
  identity-resolution, reconciliation, schema-registry-svc, data-quality
- `aggregation-zone` — governed cross-region rollups (P6)
- skeleton connectors — tiktok-ads, whatsapp, crm-\*, marketplaces, gcc
- streaming job homes (`streaming/{kafka,flink}`, `batch/spark`, `lakehouse/iceberg`) are
  created when the first real job/config lands — layout spec in
  `docs/Brain_Repository_Architecture_v2.md` §6.3

Physical schemas/DDL live in `/data` (not here) — Architecture v2 §14 (the W1 split).
