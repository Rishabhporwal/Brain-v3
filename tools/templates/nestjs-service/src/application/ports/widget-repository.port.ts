// APPLICATION PORT — an interface the application OWNS and the infrastructure IMPLEMENTS.
// This is the dependency-inversion seam: application depends on this abstraction,
// persistence/ provides the concrete adapter. Symbol token for NestJS DI.
import { Widget } from '../../domain/model/widget'
export const WIDGET_REPOSITORY = Symbol('WIDGET_REPOSITORY')
export interface WidgetRepositoryPort {
  save(widget: Widget): Promise<void>
  findById(brandId: string, id: string): Promise<Widget | null>
  listByBrand(brandId: string): Promise<Widget[]>
}
