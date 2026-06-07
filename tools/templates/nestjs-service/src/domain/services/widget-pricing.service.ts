// DOMAIN SERVICE — business logic that doesn't belong to a single entity. Pure.
import { Widget } from '../model/widget'
export class WidgetPricingService {
  /** Example invariant spanning entities: bulk price floor across a brand's catalog. */
  totalCatalogValueMinor(widgets: Widget[]): number {
    return widgets.filter((w) => !w.archived).reduce((sum, w) => sum + w.priceMinor, 0)
  }
}
