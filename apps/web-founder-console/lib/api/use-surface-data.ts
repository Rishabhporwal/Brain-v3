'use client'

import { useQuery } from '@tanstack/react-query'
import { apiJson } from './client'

/** True once the BFF is configured. Until then, surfaces render deterministic dev sample data. */
export const backendConfigured = Boolean(process.env.NEXT_PUBLIC_API_BASE_URL)

/**
 * Standard surface data hook. With a BFF configured it fetches `path`; otherwise it resolves to the
 * provided `sample` so the depth visualisations are visible in development. Same interface either way —
 * flipping NEXT_PUBLIC_API_BASE_URL switches the whole console to live data with no code change.
 */
export function useSurfaceData<T>(key: unknown[], path: string, sample: T) {
  return useQuery({
    queryKey: key,
    queryFn: () => (backendConfigured ? apiJson<T>(path) : Promise.resolve(sample)),
    retry: false,
  })
}
