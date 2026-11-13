import { getDeviceSignatureHeaders } from '@/lib/auth/device-key'
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
 * The backend rejects app requests that don't come from the account's bound,
 * signed device (`DEVICE_*` codes, e.g. a cloned install was locked). The
 * session is useless from here, so drop it and show the blocked screen.
 */
function handleDeviceRejected(code: string): void {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/login')) {
    return
  }
  clearStoredSession()
  window.location.replace(`/login?device=${encodeURIComponent(code)}`)
}

/** The backend error code (`ErrorResponse.error.code`) of a failed call, if any. */
export function getApiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null
  }
  const code = (error.payload as { error?: { code?: unknown } } | null)?.error?.code
  return typeof code === 'string' ? code : null
}

export function isDeviceErrorCode(code: string | null): code is string {
  return code !== null && code.startsWith('DEVICE_')
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

/**
 * Reads the `sub` (user id) claim from a Supabase access token without
 * verifying it. Verification is the backend's job; here we only need to know
 * which account a token *claims* to be, to detect a session swap.
 */
function getTokenSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) {
      return null
    }
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')))
    return typeof json?.sub === 'string' ? json.sub : null
  } catch {
    return null
  }
}

type RefreshResponse = {
  user?: { id?: string } | null
  session?: { accessToken: string; refreshToken: string } | null
} | null

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
        const payload = data as RefreshResponse
        const newSession = payload?.session
        if (!response.ok || !newSession) {
          return false
        }
        // A refreshed session must belong to the same account as the one it
        // replaces. If it doesn't, never adopt it: drop the session and let the
        // caller's 401 path force a clean re-login instead of silently turning
        // this device into someone else's account.
        const expectedUserId = getTokenSubject(session.accessToken)
        const receivedUserId = payload?.user?.id ?? getTokenSubject(newSession.accessToken)
        if (expectedUserId && receivedUserId && expectedUserId !== receivedUserId) {
          clearStoredSession()
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
  // Every request is signed by the device key (with a fresh counter), so a
  // retry must be signed again rather than reuse the first request's headers.
  const buildHeaders = async () => {
    const headers = new Headers(options.headers)
    for (const [key, value] of Object.entries(getAuthorizationHeaders())) {
      headers.set(key, value)
    }
    const deviceHeaders = await getDeviceSignatureHeaders(options.method ?? 'GET', url)
    for (const [key, value] of Object.entries(deviceHeaders ?? {})) {
      headers.set(key, value)
    }
    return headers
  }

  const fail = (status: number, payload: unknown): never => {
    if (status === 401) {
      handleUnauthorized()
    }
    const error = new ApiError(status, payload)
    const code = getApiErrorCode(error)
    if (status === 403 && isDeviceErrorCode(code)) {
      handleDeviceRejected(code)
    }
    throw error
  }

  let { response, data } = await rawFetch(url, { ...options, headers: await buildHeaders() })

  // The backend saw this request's counter before (the browser re-sent it on a
  // flaky connection). Reads are safe to sign again and retry once; writes are
  // not, since the first copy may already have been applied.
  const method = (options.method ?? 'GET').toUpperCase()
  if (
    response.status === 409 &&
    (method === 'GET' || method === 'HEAD') &&
    getApiErrorCode(new ApiError(409, data)) === 'DEVICE_COUNTER_REUSED'
  ) {
    ;({ response, data } = await rawFetch(url, { ...options, headers: await buildHeaders() }))
  }

  if (response.status === 401 && !url.endsWith(REFRESH_PATH) && (await refreshAccessToken())) {
    const retry = await rawFetch(url, { ...options, headers: await buildHeaders() })
    if (!retry.response.ok) {
      return fail(retry.response.status, retry.data)
    }
    return retry.data as T
  }

  if (!response.ok) {
    return fail(response.status, data)
  }

  return data as T
}
