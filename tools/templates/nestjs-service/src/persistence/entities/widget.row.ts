// PERSISTENCE ENTITY — the DB row shape (snake_case columns). Mapped to/from the
// domain aggregate by the repository. Physical DDL lives in /data/stores/postgres.
import { Widget } from '../../domain/model/widget'
export interface WidgetRow {
  id: string
  brand_id: string
  name: string
  price_minor: string
  archived: boolean
  created_at: string
}
export const toDomain = (r: WidgetRow): Widget =>
  Widget.rehydrate({
    id: r.id,
    brandId: r.brand_id,
    name: r.name,
    priceMinor: Number(r.price_minor),
    archived: r.archived,
    createdAt: new Date(r.created_at),
  })
