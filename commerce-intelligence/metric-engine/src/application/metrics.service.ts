import { BadRequestException, Injectable } from '@nestjs/common'
import { FORMULAS } from '../domain/formulas'
import { loadRegistry, type MetricDefinition } from '../domain/registry'
import { ClickhouseReader, type Period } from '../persistence/clickhouse.reader'

export interface MetricValue {
  id: string
  value: number
  unit: MetricDefinition['unit']
  formula_version: number
  estimated: boolean
}

export interface MetricsResponse {
  brand_id: string
  period: Period
  computed_at: string
  metrics: MetricValue[]
}

/**
 * The Tier-0 metric engine: the only component permitted to produce a business figure. Every
 * implemented formula is version-locked to the formula book (contracts/metrics/registry.yaml) —
 * a drift between code and book refuses to boot (and fails the parity test in CI).
 */
@Injectable()
export class MetricsService {
  readonly registry = loadRegistry()

  constructor(private readonly reader: ClickhouseReader) {
    for (const [id, formula] of Object.entries(FORMULAS)) {
      const def = this.registry.get(id)
      if (!def) throw new Error(`metric-engine: '${id}' implemented but not in contracts/metrics/registry.yaml`)
      if (def.formula_version !== formula.formula_version)
        throw new Error(
          `metric-engine: '${id}' formula_version drift (code ${formula.formula_version} ≠ registry ${def.formula_version})`,
        )
    }
  }

  async compute(brandId: string, ids: string[], period: Period = {}): Promise<MetricsResponse> {
    const unknown = ids.filter((id) => !FORMULAS[id])
    if (unknown.length) throw new BadRequestException(`unknown metric(s): ${unknown.join(', ')}`)
    const raw = await this.reader.aggregates(brandId, period)
    const metrics: MetricValue[] = []
    for (const id of ids) {
      const computed = FORMULAS[id].compute(raw)
      if (computed === null) continue // not computable from current data — omit, never fabricate
      const def = this.registry.get(id)!
      metrics.push({
        id,
        value: computed.value,
        unit: def.unit,
        formula_version: def.formula_version,
        estimated: computed.estimated,
      })
    }
    return { brand_id: brandId, period, computed_at: new Date().toISOString(), metrics }
  }

  definitions(): MetricDefinition[] {
    return [...this.registry.values()]
  }
}
