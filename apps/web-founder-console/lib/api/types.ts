/** Shared types for the BFF client. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Standard list envelope used by the BFF (keyset pagination). */
export interface Page<T> {
  items: T[]
  nextCursor?: string | null
  total?: number
}
