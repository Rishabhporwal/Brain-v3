# Event contracts — the streaming backbone's source of truth

`topics.yaml` registers every topic (live + planned); `schemas/` holds the JSON Schemas
(draft 2020-12) for each live envelope and canonical record.

## Why JSON Schema (today) and not Avro

The wire format on every live topic is a **versioned JSON envelope** (`schema_version: "1"`)
and ClickHouse consumes it as `JSONAsString` — so JSON Schema is the contract that matches
reality. The Avro/registry upgrade (Redpanda schema registry, local `:18081`) is the
production hardening step that lands with `schema-registry-svc` (see the service catalog);
when producers move to registry-encoded messages, these schemas are the basis for the
Avro translation and the compatibility rules.

## How the contract is enforced

`platform/api-gateway-bff/src/infrastructure/messaging/events.contract.spec.ts` builds the
exact envelopes the producer emits (via the exported `build*Envelope` functions) and
validates them — plus canonical record fixtures — against these schemas with ajv on every
test run. Changing the producer shape without updating the schema (or vice versa) fails CI.

## Registry tooling

`tools/scripts/schema-registry.mjs` publishes these schemas to the (Redpanda) Schema
Registry and gates changes on **BACKWARD** compatibility:

```
pnpm schemas:check     # compatibility check vs latest registered (exit 1 on breaking)
pnpm schemas:publish   # register new versions (sets BACKWARD compat per subject)
```

Registry URL: `$SCHEMA_REGISTRY_URL` or `http://localhost:18081` (local Redpanda).
Subjects follow TopicNameStrategy (`<topic>-value`); cross-schema `brain://` refs are
bundled (inlined) so each subject is self-contained. `--dry-run` validates bundling
without a registry. Wire `schemas:check` into CI once the pipeline has a registry
(or run it with `--dry-run` until then).

## Evolution rules (until the registry enforces them)

- **Additive only within v1**: new optional fields are fine; never remove or re-type a field
  the ClickHouse MVs extract (they are the de-facto consumers — see `payload_schemas` notes
  in `topics.yaml`).
- Breaking change ⇒ new schema file (`*.v2.schema.json`) + new `schema_version` value +
  both versions consumed during the migration window.
- Money: integer minor units as strings (`amount_minor`); the ad-spend cost field is
  provider-variant in v1 (documented in the schema) — canonicalizing it to `spend_minor`
  is the v2 upgrade.
