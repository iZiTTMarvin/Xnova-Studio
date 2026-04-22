// src/hooks/useApi.ts

/**
 * REST API 请求封装。
 * 所有请求成功后打印日志到控制台，方便调试。
 */

const BASE = ''

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function parseError(resp: Response, method: string, path: string): Promise<never> {
  console.error(`[API] ${method} ${path} → ${resp.status}`)
  let message = `API ${path}: ${resp.status}`
  let code: string | undefined
  try {
    const data = await resp.json() as { error?: string; code?: string; message?: string }
    message = data.error ?? data.message ?? message
    code = data.code
  } catch {
    // ignore non-JSON error body
  }
  throw new ApiError(message, resp.status, code)
}

export async function apiGet<T>(path: string): Promise<T> {
  console.log(`[API] GET ${path}`)
  const resp = await fetch(`${BASE}${path}`)
  if (!resp.ok) {
    return parseError(resp, 'GET', path)
  }
  const data = await resp.json() as T
  console.log(`[API] GET ${path} → OK`, data)
  return data
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  console.log(`[API] POST ${path}`, body)
  const resp = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    return parseError(resp, 'POST', path)
  }
  const data = await resp.json() as T
  console.log(`[API] POST ${path} → OK`, data)
  return data
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  console.log(`[API] PUT ${path}`, body)
  const resp = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    return parseError(resp, 'PUT', path)
  }
  const data = await resp.json() as T
  console.log(`[API] PUT ${path} → OK`, data)
  return data
}

export async function apiDelete<T>(path: string): Promise<T> {
  console.log(`[API] DELETE ${path}`)
  const resp = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!resp.ok) {
    return parseError(resp, 'DELETE', path)
  }
  const data = await resp.json() as T
  console.log(`[API] DELETE ${path} → OK`, data)
  return data
}
