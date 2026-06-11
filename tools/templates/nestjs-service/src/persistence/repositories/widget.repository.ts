// PERSISTENCE ADAPTER — the concrete implementation of WidgetRepositoryPort.
// This is the ONLY place SQL lives. Swappable (Postgres→other) without touching
// application/ or domain/. Per-brand RLS is enforced by the DB; we also scope by brand_id.
import { Inject, Injectable } from '@nestjs/common'
import { Pool } from 'pg'
import { Widget } from '../../domain/model/widget'
import { WidgetRepositoryPort } from '../../application/ports/widget-repository.port'
import { PG_POOL } from '../../config/tokens'
import { WidgetRow, toDomain } from '../entities/widget.row'

@Injectable()
export class WidgetRepository implements WidgetRepositoryPort {
  constructor(@Inject(PG_POOL) private readonly pg: Pool) {}

  async save(w: Widget): Promise<void> {
    await this.pg.query(
      `INSERT INTO catalog.widgets(id, brand_id, name, price_minor, archived, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price_minor=EXCLUDED.price_minor, archived=EXCLUDED.archived`,
      [w.id, w.brandId, w.name, w.priceMinor, w.archived, w.createdAt],
    )
  }
  async findById(brandId: string, id: string): Promise<Widget | null> {
    const { rows } = await this.pg.query<WidgetRow>(
      `SELECT * FROM catalog.widgets WHERE brand_id=$1 AND id=$2 LIMIT 1`,
      [brandId, id],
    )
    return rows[0] ? toDomain(rows[0]) : null
  }
  async listByBrand(brandId: string): Promise<Widget[]> {
    const { rows } = await this.pg.query<WidgetRow>(
      `SELECT * FROM catalog.widgets WHERE brand_id=$1 ORDER BY created_at`,
      [brandId],
    )
    return rows.map(toDomain)
  }
}
