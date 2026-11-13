import { webcrypto } from 'node:crypto'

/**
 * Pure helpers for device request signing. The PWA holds a non-extractable
 * ECDSA P-256 key in IndexedDB and signs every API request with it, together
 * with a per-device counter that only ever moves forward. See
 * `device.service.ts` for how the server enforces it.
 */

export const deviceHeaders = {
  id: 'x-device-id',
  counter: 'x-device-counter',
  signature: 'x-device-signature',
  key: 'x-device-key',
  fingerprint: 'x-device-fingerprint'
} as const

export type DevicePublicKey = {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
}

/**
 * Hardware/screen traits that survive OS/browser updates but differ between
 * phone models. Used to notice a binding moving to different hardware (e.g. a
 * full storage transfer to a new phone).
 */
export type DeviceFingerprint = {
  platform?: string
  screen?: string
  cores?: number
  memory?: number
  touch?: number
  gpu?: string
}

const fingerprintKeys = ['platform', 'screen', 'cores', 'memory', 'touch', 'gpu'] as const

/** The exact bytes a client signs. Must match `check-in-app/src/lib/auth/device-key.ts`. */
export function buildSignedPayload(input: {
  deviceId: string
  counter: number
  method: string
  path: string
}) {
  return `trinity-device-v1\n${input.deviceId}\n${input.counter}\n${input.method.toUpperCase()}\n${input.path}`
}

function decodeBase64UrlJson(value: string | undefined): unknown {
  if (!value || value.length > 4096) {
    return null
  }
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

/** Parses a public JWK header. Anything that is not a bare P-256 public key is rejected. */
export function parseDevicePublicKey(value: unknown): DevicePublicKey | null {
  const raw = typeof value === 'string' ? decodeBase64UrlJson(value) : value
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const jwk = raw as Record<string, unknown>
  if (
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.y !== 'string' ||
    'd' in jwk
  ) {
    return null
  }
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }
}

export function parseDeviceFingerprint(value: unknown): DeviceFingerprint | null {
  const raw = typeof value === 'string' ? decodeBase64UrlJson(value) : value
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const source = raw as Record<string, unknown>
  const fingerprint: DeviceFingerprint = {}
  for (const key of ['platform', 'screen', 'gpu'] as const) {
    const field = source[key]
    if (typeof field === 'string' && field.length > 0 && field.length <= 200) {
      fingerprint[key] = field
    }
  }
  for (const key of ['cores', 'memory', 'touch'] as const) {
    const field = source[key]
    if (typeof field === 'number' && Number.isFinite(field)) {
      fingerprint[key] = field
    }
  }
  return fingerprint
}

/** Fields present on both sides that disagree. Missing fields are not counted. */
export function diffFingerprints(enrolled: DeviceFingerprint, current: DeviceFingerprint) {
  return fingerprintKeys.filter(
    (key) => enrolled[key] !== undefined && current[key] !== undefined && enrolled[key] !== current[key]
  )
}

/**
 * Whether a fingerprint change means different hardware. Physical screen
 * resolution alone is decisive; any other single trait (platform string, GPU
 * name, memory bucket) can change with a browser update, so it takes two of
 * them together.
 */
export function isHardwareChange(changed: readonly string[]) {
  return changed.includes('screen') || changed.length >= 2
}

export function sameDevicePublicKey(a: DevicePublicKey, b: DevicePublicKey) {
  return a.x === b.x && a.y === b.y
}

/**
 * Some browsers (e.g. Vivo's built-in browser) wipe IndexedDB while keeping
 * localStorage, so the same phone comes back with its device id but a brand
 * new key. That is a lost key, not a copy, as long as the hardware is the same
 * and the key has never been seen before. A key that was already replaced
 * coming back means two installs are taking turns: that stays a lock.
 */
export const MAX_RETIRED_KEYS = 20

export type RetiredDeviceKey = { x: string; y: string; retiredAt: string }

export function readRetiredKeys(metadata: unknown): RetiredDeviceKey[] {
  const value = (metadata as { retiredKeys?: unknown } | null)?.retiredKeys
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(
    (key): key is RetiredDeviceKey =>
      typeof key?.x === 'string' && typeof key?.y === 'string' && typeof key?.retiredAt === 'string'
  )
}

export function isRetiredKey(retired: RetiredDeviceKey[], key: DevicePublicKey) {
  return retired.some((old) => old.x === key.x && old.y === key.y)
}

export function retireKey(retired: RetiredDeviceKey[], key: DevicePublicKey, now: Date) {
  return [...retired, { x: key.x, y: key.y, retiredAt: now.toISOString() }].slice(-MAX_RETIRED_KEYS)
}

/**
 * A single reused counter is usually the browser re-sending a request on a
 * flaky connection. A clone reuses counter after counter as soon as both
 * installs are in use, so only several distinct reused counters in a short
 * window lock the binding.
 */
export const REPLAY_WINDOW_MS = 10 * 60 * 1000
export const REPLAY_LOCK_THRESHOLD = 3

export type DeviceReplay = { counter: number; at: string }

export function readReplays(metadata: unknown): DeviceReplay[] {
  const value = (metadata as { replays?: unknown } | null)?.replays
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(
    (replay): replay is DeviceReplay => typeof replay?.counter === 'number' && typeof replay?.at === 'string'
  )
}

export function recordReplay(replays: DeviceReplay[], counter: number, now: Date) {
  const since = now.getTime() - REPLAY_WINDOW_MS
  const recent = [...replays, { counter, at: now.toISOString() }].filter(
    (replay) => new Date(replay.at).getTime() > since
  )
  const distinct = new Set(recent.map((replay) => replay.counter)).size
  return { replays: recent, shouldLock: distinct >= REPLAY_LOCK_THRESHOLD }
}

export function parseCounter(value: string | undefined) {
  if (!value || !/^\d{1,15}$/.test(value)) {
    return null
  }
  return Number(value)
}

export async function verifyDeviceSignature(
  publicKey: DevicePublicKey,
  payload: string,
  signature: string | undefined
) {
  if (!signature || signature.length > 200) {
    return false
  }
  try {
    const key = await webcrypto.subtle.importKey(
      'jwk',
      publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
    return await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(payload)
    )
  } catch {
    return false
  }
}
