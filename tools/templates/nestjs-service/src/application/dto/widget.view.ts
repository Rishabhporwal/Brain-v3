// READ MODEL / VIEW DTO — what queries return to the api layer (never the domain entity).
export interface WidgetView {
  id: string
  name: string
  priceMinor: number
  archived: boolean
}
