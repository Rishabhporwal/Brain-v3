import 'server-only'
import { getAccessToken } from '@/lib/auth'
import { ApiError } from './types'

/** Server → BFF client for Server Components / route handlers (token from the server session). */
const BASE = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(`${BASE}${path}`, { ...init, headers, cache: 'no-store' })
}

export async function serverJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await serverFetch(path, init)
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}
