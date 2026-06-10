#!/usr/bin/env node
/**
 * Schema-registry tooling for contracts/events — publish the canonical JSON Schemas to the
 * (Redpanda) Schema Registry and gate changes on BACKWARD compatibility.
 *
 *   node tools/scripts/schema-registry.mjs check    [--registry URL] [--dry-run]
 *   node tools/scripts/schema-registry.mjs publish  [--registry URL] [--dry-run]
 *
 * Default registry: $SCHEMA_REGISTRY_URL or http://localhost:18081 (local Redpanda external port).
 * Subjects follow TopicNameStrategy (<topic>-value). Cross-schema $refs (brain://events/…) are
 * BUNDLED (inlined) before upload so the registry holds one self-contained document per subject —
 * no registry-side reference plumbing. `check` exits 1 on any incompatible change; `--dry-run`
 * validates bundling without a registry (used in CI without infra).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'contracts', 'events', 'schemas')
const REGISTRY = process.argv.includes('--registry')
  ? process.argv[process.argv.indexOf('--registry') + 1]
  : (process.env.SCHEMA_REGISTRY_URL ?? 'http://localhost:18081')
const DRY_RUN = process.argv.includes('--dry-run')
const MODE = process.argv[2]

/** Topic subject → envelope schema file. Records are inlined into the envelopes (keep in sync with topics.yaml). */
const SUBJECTS = {
  'brain.integration.events-value': 'integration.event.v1.schema.json',
  'brain.integration.webhooks-value': 'integration.webhook.v1.schema.json',
  'brain.integration.pull-value': 'integration.pull.v1.schema.json',
}

// ── load all schemas by $id ────────────────────────────────────────────────────────────────────
const byId = new Map()
for (const f of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json'))) {
  const s = JSON.parse(readFileSync(join(SCHEMA_DIR, f), 'utf8'))
  if (s.$id) byId.set(s.$id, s)
}

/** Inline every brain:// $ref so the uploaded document is self-contained. */
function bundle(node, seen = new Set()) {
  if (Array.isArray(node)) return node.map((n) => bundle(n, seen))
  if (node === null || typeof node !== 'object') return node
  if (typeof node.$ref === 'string' && node.$ref.startsWith('brain://')) {
    if (seen.has(node.$ref)) throw new Error(`circular $ref: ${node.$ref}`)
    const target = byId.get(node.$ref)
    if (!target) throw new Error(`unresolved $ref: ${node.$ref}`)
    const { $id, $schema, ...rest } = target // strip identifiers on inlined copies
    return bundle(rest, new Set([...seen, node.$ref]))
  }
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, bundle(v, seen)]))
}

async function api(method, path, payload) {
  const res = await fetch(`${REGISTRY}${path}`, {
    method,
    headers: { 'Content-Type': 'application/vnd.schemaregistry.v1+json' },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  if (res.status === 404) return { notFound: true }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(body)}`)
  return body
}

let failed = false
for (const [subject, file] of Object.entries(SUBJECTS)) {
  const bundled = bundle(JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')))
  if (JSON.stringify(bundled).includes('"$ref":"brain://')) throw new Error(`${file}: unbundled ref remains`)
  if (DRY_RUN) {
    console.log(`dry-run ✓ ${subject} ← ${file} (bundled ${JSON.stringify(bundled).length} bytes)`)
    continue
  }
  const payload = { schema: JSON.stringify(bundled), schemaType: 'JSON' }
  if (MODE === 'check') {
    const latest = await api('GET', `/subjects/${subject}/versions/latest`)
    if (latest.notFound) {
      console.log(`check ∅ ${subject}: no registered version yet (new subject)`)
      continue
    }
    const r = await api('POST', `/compatibility/subjects/${subject}/versions/latest`, payload)
    const ok = r.is_compatible === true
    console.log(`check ${ok ? '✓' : '✗'} ${subject}: ${ok ? 'BACKWARD compatible' : 'INCOMPATIBLE with latest'}`)
    if (!ok) failed = true
  } else if (MODE === 'publish') {
    await api('PUT', `/config/${subject}`, { compatibility: 'BACKWARD' })
    const r = await api('POST', `/subjects/${subject}/versions`, payload)
    console.log(`publish ✓ ${subject} → schema id ${r.id}`)
  } else {
    console.error('usage: schema-registry.mjs <check|publish> [--registry URL] [--dry-run]')
    process.exit(2)
  }
}
process.exit(failed ? 1 : 0)
