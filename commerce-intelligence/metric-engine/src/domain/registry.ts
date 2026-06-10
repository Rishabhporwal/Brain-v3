import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The formula book (contracts/metrics/registry.yaml) loaded as the engine's authority: a metric
 * may only be served if it is registered, and the implementation's formula_version must match the
 * book (CI parity test). Minimal YAML subset parser — the registry is a flat, known shape; no
 * yaml dependency needed.
 */
export interface MetricDefinition {
  id: string
  formula_version: number
  unit: 'minor_units' | 'count' | 'ratio' | 'percent'
  definition: string
  inputs: string[]
}

export function loadRegistry(path?: string): Map<string, MetricDefinition> {
  const file = path ?? join(__dirname, '..', '..', '..', '..', 'contracts', 'metrics', 'registry.yaml')
  const text = readFileSync(file, 'utf8')
  const metrics = new Map<string, MetricDefinition>()
  let current: Partial<MetricDefinition> | null = null
  let inDefinition = false
  for (const line of text.split('\n')) {
    const item = line.match(/^  - id: (\S+)/)
    if (item) {
      if (current?.id) metrics.set(current.id, current as MetricDefinition)
      current = { id: item[1], inputs: [] }
      inDefinition = false
      continue
    }
    if (!current) continue
    const kv = line.match(/^    (\w+): (.+)$/)
    if (kv) {
      inDefinition = false
      const [, key, raw] = kv
      if (key === 'formula_version') current.formula_version = Number(raw)
      else if (key === 'unit') current.unit = raw.trim() as MetricDefinition['unit']
      else if (key === 'inputs') current.inputs = raw.replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean)
      else if (key === 'definition') {
        if (raw.trim() === '>-') {
          inDefinition = true
          current.definition = ''
        } else current.definition = raw.trim()
      }
      continue
    }
    if (inDefinition && line.startsWith('      ')) {
      current.definition = `${current.definition ?? ''} ${line.trim()}`.trim()
    }
  }
  if (current?.id) metrics.set(current.id, current as MetricDefinition)
  return metrics
}
