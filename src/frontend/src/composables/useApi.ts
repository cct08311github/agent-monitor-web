// ---------------------------------------------------------------------------
// useApi — fetch wrapper ported from api-client.js
//
// Works both as a Vue composable (inside setup) AND as a standalone module
// (imported directly outside components). The basePath must be initialised
// once at app bootstrap via setBasePath() before any requests are made.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Base-path management
// ---------------------------------------------------------------------------

let _basePath = ''

/** Call once at app startup with the value detected from the URL / env. */
export function setBasePath(path: string): void {
  _basePath = path.replace(/\/+$/, '')
}

export function getBasePath(): string {
  return _basePath
}

function prefixUrl(url: string): string {
  if (_basePath && url.startsWith('/')) {
    return _basePath + url
  }
  return url
}

// ---------------------------------------------------------------------------
// Typed API error
// ---------------------------------------------------------------------------

export interface ApiRequestError extends Error {
  payload?: Record<string, unknown>
  status?: number
}

function makeApiError(
  message: string,
  payload?: Record<string, unknown>,
  status?: number,
): ApiRequestError {
  const err = new Error(message) as ApiRequestError
  err.payload = payload
  err.status = status
  return err
}

// ---------------------------------------------------------------------------
// Core request
// ---------------------------------------------------------------------------

async function request(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(prefixUrl(url), {
    credentials: 'include',
    ...options,
  })

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error(response.ok ? 'Invalid JSON response' : 'Request failed')
  }

  if (!response.ok) {
    const body = data as Record<string, unknown> | undefined
    const message =
      (body?.message as string | undefined) ??
      (body?.error as string | undefined) ??
      'Request failed'
    throw makeApiError(message, body, response.status)
  }

  return data
}

// ---------------------------------------------------------------------------
// HTTP method helpers
// ---------------------------------------------------------------------------

function get(url: string, options?: RequestInit): Promise<unknown> {
  return request(url, options)
}

function withJsonBody(
  method: string,
  url: string,
  body: unknown,
  options?: RequestInit,
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) ?? {}),
  }
  return request(url, {
    ...options,
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function post(url: string, body?: unknown, options?: RequestInit): Promise<unknown> {
  return withJsonBody('POST', url, body, options)
}

function patch(url: string, body?: unknown, options?: RequestInit): Promise<unknown> {
  return withJsonBody('PATCH', url, body, options)
}

function del(url: string, options?: RequestInit): Promise<unknown> {
  return request(url, { ...options, method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// withRetry — exponential back-off, honours Retry-After payload
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const apiErr = err as ApiRequestError
      // Never retry auth errors
      if (apiErr.status === 401) throw err
      if (i >= maxAttempts - 1) throw err
      // Exponential delay; respect Retry-After from error payload
      let delay = baseDelayMs * Math.pow(2, i)
      const retryAfter = apiErr.payload?.retryAfter
      if (retryAfter !== undefined) {
        delay = Math.max(delay, Number(retryAfter) * 1000)
      }
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

// ---------------------------------------------------------------------------
// Standalone export — use `api.get(...)` outside Vue components
// ---------------------------------------------------------------------------

export const api = { get, post, patch, del, withRetry, request }

// ---------------------------------------------------------------------------
// Composable — provides the same interface inside Vue setup()
// ---------------------------------------------------------------------------

export function useApi() {
  return { get, post, patch, del, withRetry, request }
}
