/**
 * Device binding for the Trinity AD Staff PWA.
 *
 * The backend binds a staff account to a single device by a stable UUID sent on
 * sign-in (`deviceUuid` + `clientType: 'MOBILE'`). We persist that UUID in
 * localStorage so the same browser/PWA install keeps the same identity; signing
 * in from a different device produces a fresh UUID the backend will reject with
 * a 403 (the login screen surfaces that as the "blocked" state).
 */

const DEVICE_UUID_KEY = 'trinity.device-uuid'

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Returns the stable device UUID, creating and persisting one on first call.
 * Returns `null` on the server (no localStorage).
 */
export function getDeviceUuid(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const existing = window.localStorage.getItem(DEVICE_UUID_KEY)
    if (existing) {
      return existing
    }
    const next = generateUuid()
    window.localStorage.setItem(DEVICE_UUID_KEY, next)
    return next
  } catch {
    // localStorage unavailable — fall back to an ephemeral UUID.
    return generateUuid()
  }
}

/**
 * Persists a server-authoritative device UUID (e.g. the one returned by
 * sign-in), so the client and backend can never diverge.
 */
export function setDeviceUuid(uuid: string): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(DEVICE_UUID_KEY, uuid)
  } catch {
    // ignore
  }
}

/** Clears the persisted device UUID (simulates "clear browser storage"). */
export function clearDeviceUuid(): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(DEVICE_UUID_KEY)
  } catch {
    // ignore
  }
}
