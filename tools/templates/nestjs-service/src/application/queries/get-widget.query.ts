import { Inject, Injectable } from '@nestjs/common'
import { WIDGET_REPOSITORY, WidgetRepositoryPort } from '../ports/widget-repository.port'
import { WidgetNotFound } from '../../domain/errors/widget.errors'
import { WidgetView } from '../dto/widget.view'

/** QUERY HANDLER — read side. May bypass the aggregate for read-optimized projections;
 *  here it reuses the repository for brevity. */
@Injectable()
export class GetWidgetQuery {
  constructor(@Inject(WIDGET_REPOSITORY) private readonly repo: WidgetRepositoryPort) {}
  async execute(brandId: string, id: string): Promise<WidgetView> {
    const w = await this.repo.findById(brandId, id)
    if (!w) throw new WidgetNotFound(id)
    return { id: w.id, name: w.name, priceMinor: w.priceMinor, archived: w.archived }
  }
}
