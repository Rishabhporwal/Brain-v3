// DOMAIN EVENT — an immutable fact about something that happened. Named past-tense.
// Published by infrastructure AFTER the write commits (transactional outbox).
export class WidgetCreated {
  readonly type = 'widget.created' as const
  constructor(
    public readonly widgetId: string,
    public readonly brandId: string,
    public readonly name: string,
    public readonly priceMinor: number,
    public readonly occurredAt: Date,
  ) {}
}
