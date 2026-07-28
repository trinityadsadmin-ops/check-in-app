import { apiBaseUrl } from '@/lib/config/api'
import { getAuthorizationHeaders } from './session'

type FetchJsonOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  withAuth?: boolean
}

type ErrorPayload = {
  error?: {
    code?: unknown
    message?: unknown
  }
}

function getPayloadErrorCode(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return undefined
  }

  const error = (payload as ErrorPayload).error
  return typeof error?.code === 'string' ? error.code : undefined
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get code() {
    return getPayloadErrorCode(this.payload)
  }
}

export function getApiErrorCode(error: unknown) {
  if (error instanceof ApiError) {
    return error.code
  }

  return getPayloadErrorCode(error)
}

export async function fetchJson<TResponse>(
  path: string,
  { body, headers, withAuth = true, ...init }: FetchJsonOptions = {}
): Promise<TResponse> {
  const requestHeaders = new Headers(headers)
  requestHeaders.set('Content-Type', 'application/json')

  if (withAuth) {
    for (const [key, value] of Object.entries(getAuthorizationHeaders())) {
      requestHeaders.set(key, value)
    }
  }

  const requestInit: RequestInit = {
    ...init,
    headers: requestHeaders
  }

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, requestInit)

  const contentType = response.headers.get('content-type')
  const payload = contentType?.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'object' &&
      payload.error !== null &&
      'message' in payload.error &&
      typeof payload.error.message === 'string'
        ? payload.error.message
        : 'Request failed'

    throw new ApiError(message, response.status, payload)
  }

  return payload as TResponse
}
