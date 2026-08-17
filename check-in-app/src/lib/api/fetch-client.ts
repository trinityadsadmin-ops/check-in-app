import { clearStoredSession, getAuthorizationHeaders, getStoredSession, setStoredSession } from './session'

/**
 * Session expiry handler. A 401 on any authenticated call means the token is no
 * longer valid, so we clear it and force the user back to the login page. We skip
 * this while already on /login (a bad-credentials 401 during sign-in must surface
 * its own error, not redirect-loop).
 */
function handleUnauthorized(): void {
  if (typeof window === 'undefined') {
    return
  }
  if (window.location.pathname.startsWith('/login')) {
    return
  }
  clearStoredSession()
  window.location.replace('/login?session=expired')
}

/**
 * Error thrown for any non-2xx response. `payload` holds the parsed JSON body
 * (typically the backend's ErrorResponse), `status` the HTTP status code.
 */
export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, payload: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

const REFRESH_PATH = '/api/auth/refresh'

async function rawFetch(url: string, options: RequestInit) {
  const response = await fetch(url, options)
  const raw = [204, 205, 304].includes(response.status) ? '' : await response.text()
  const data = raw ? JSON.parse(raw) : null
  return { response, data }
}

/**
 * The Supabase access token is short-lived (≈1h), so any session that survives
 * idle gaps longer than that must exchange the long-lived refresh token for a
 * new one — otherwise every returning user gets bounced to /login regardless of
 * how long the UI claims the session lasts. Concurrent 401s (a page firing
 * several queries at once) share one in-flight refresh via `refreshPromise`
 * rather than each racing their own.
 */
let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  const session = getStoredSession()
  if (!session) {
    return false
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const { response, data } = await rawFetch(REFRESH_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken })
        })
        const newSession = (data as { session?: { accessToken: string; refreshToken: string } | null } | null)
          ?.session
        if (!response.ok || !newSession) {
          return false
        }
        setStoredSession({ accessToken: newSession.accessToken, refreshToken: newSession.refreshToken })
        return true
      } catch {
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }

  return refreshPromise
}

/**
 * Orval mutator used by every generated API call. It injects the stored Bearer
 * token (when present) and throws an {@link ApiError} on non-2xx responses, so
 * React Query hooks surface failures via `isError` / rejected `mutateAsync`.
 * A 401 (expired access token) transparently refreshes and retries once before
 * giving up and forcing a re-login.
 */
export const customFetch = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  const headers = new Headers(options.headers)

  for (const [key, value] of Object.entries(getAuthorizationHeaders())) {
    if (!headers.has(key)) {
      headers.set(key, value)
    }
  }

  const { response, data } = await rawFetch(url, { ...options, headers })

  if (response.status === 401 && !url.endsWith(REFRESH_PATH) && (await refreshAccessToken())) {
    const retryHeaders = new Headers(options.headers)
    for (const [key, value] of Object.entries(getAuthorizationHeaders())) {
      retryHeaders.set(key, value)
    }
    const retry = await rawFetch(url, { ...options, headers: retryHeaders })
    if (!retry.response.ok) {
      if (retry.response.status === 401) {
        handleUnauthorized()
      }
      throw new ApiError(retry.response.status, retry.data)
    }
    return retry.data as T
  }

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized()
    }
    throw new ApiError(response.status, data)
  }

  return data as T
}
