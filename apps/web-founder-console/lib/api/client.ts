'use client'

import { getSession } from 'next-auth/react'
import { ApiError } from './types'

/**
 * Browser → BFF client. The single fetch seam for client components.
 * - Prepends NEXT_PUBLIC_API_BASE_URL (empty = same-origin Next routes).
 * - Attaches the Keycloak access token from the Auth.js session as a Bearer header.
 * Until the V2 BFF exists this returns network/HTTP errors which surfaces render as empty/error states.
 */
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  let token: string | undefined
  try {
    token = (await getSession())?.accessToken
  } catch {
    /* unauthenticated — let the BFF return 401 */
  }
  const headers = new Headers(init?.headers)
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' })
}

/** Typed JSON helper — throws ApiError on non-2xx so TanStack Query can surface it. */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  if (!res.ok) {
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = await res.text().catch(() => null)
    }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, body)
  }
  return res.json() as Promise<T>
}
