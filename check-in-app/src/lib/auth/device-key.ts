/**
 * Signed device identity for the Trinity AD Staff PWA.
 *
 * A native app could use hardware attestation; a PWA can't, so we make a copied
 * install as easy to catch as possible instead:
 *
 * - An ECDSA P-256 key pair is generated once and stored in IndexedDB with a
 *   **non-extractable** private key: page script (and anyone poking at storage
 *   in dev tools) can use it to sign but can never read it out. Copying the
 *   device id to another phone is therefore useless.
 * - Every API request is signed together with a counter that only moves
 *   forward, kept in the same IndexedDB record. If storage is cloned wholesale
 *   (e.g. a phone-to-phone transfer), the original and the copy start reusing
 *   each other's counters as soon as both are used, which the backend detects
 *   and locks the binding until an administrator reviews it.
 * - Stable hardware traits (screen resolution, GPU, cores...) travel with each
 *   request, so a transfer onto a different phone model is caught even if the
 *   old phone is never used again.
 *
 * The payload format must match `check-in-backend/src/modules/auth/device-trust.ts`.
 */

import { getDeviceUuid } from './device'

const DB_NAME = 'trinity-device'
const STORE = 'identity'
const RECORD_KEY = 'device'

type DeviceRecord = {
  privateKey: CryptoKey
  publicJwk: JsonWebKey
  counter: number
}

export const deviceHeaderNames = {
  id: 'X-Device-Id',
  counter: 'X-Device-Counter',
  signature: 'X-Device-Signature',
  key: 'X-Device-Key',
  fingerprint: 'X-Device-Fingerprint'
} as const

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

let dbPromise: Promise<IDBDatabase> | null = null
let creating: Promise<void> | null = null

function getDb() {
  dbPromise ??= openDb().catch((error) => {
    dbPromise = null
    throw error
  })
  return dbPromise
}

function readRecord(db: IDBDatabase): Promise<DeviceRecord | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(RECORD_KEY)
    request.onsuccess = () => resolve(request.result as DeviceRecord | undefined)
    request.onerror = () => reject(request.error)
  })
}

async function ensureRecord(db: IDBDatabase) {
  if (await readRecord(db)) {
    return
  }
  creating ??= (async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify'
    ])
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      // `add` fails if another tab created the record first; keep theirs.
      const request = store.add(
        { privateKey: pair.privateKey, publicJwk, counter: 0 } satisfies DeviceRecord,
        RECORD_KEY
      )
      request.onerror = (event) => {
        event.preventDefault()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => (tx.error?.name === 'ConstraintError' ? resolve() : reject(tx.error))
    })
  })().finally(() => {
    creating = null
  })
  await creating
}

/**
 * Atomically increments and returns the counter. IndexedDB serializes
 * read-write transactions on the same store, so concurrent requests and tabs
 * never draw the same value.
 */
function takeCounter(db: IDBDatabase): Promise<DeviceRecord> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    let next: DeviceRecord | undefined
    const request = store.get(RECORD_KEY)
    request.onsuccess = () => {
      const record = request.result as DeviceRecord | undefined
      if (!record) {
        tx.abort()
        return
      }
      next = { ...record, counter: record.counter + 1 }
      store.put(next, RECORD_KEY)
    }
    tx.oncomplete = () => (next ? resolve(next) : reject(new Error('Device key missing')))
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Device key missing'))
  })
}

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of view) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)))
}

function readGpu(): string | undefined {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) {
      return undefined
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return typeof renderer === 'string' && renderer ? renderer.slice(0, 200) : undefined
  } catch {
    return undefined
  }
}

let cachedFingerprint: Record<string, string | number> | null = null

/**
 * Traits that stay the same across OS/browser updates and page zoom but differ
 * between phone models. Resolution is in physical pixels (zoom-independent)
 * and orientation-independent.
 */
function readFingerprint() {
  if (cachedFingerprint) {
    return cachedFingerprint
  }
  const dpr = window.devicePixelRatio || 1
  const physical = [window.screen.width, window.screen.height].map((side) => Math.round((side * dpr) / 10) * 10)
  const fingerprint: Record<string, string | number> = {
    screen: `${Math.min(...physical)}x${Math.max(...physical)}`
  }
  if (navigator.platform) fingerprint.platform = navigator.platform
  if (navigator.hardwareConcurrency) fingerprint.cores = navigator.hardwareConcurrency
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (memory) fingerprint.memory = memory
  if (typeof navigator.maxTouchPoints === 'number') fingerprint.touch = navigator.maxTouchPoints
  const gpu = readGpu()
  if (gpu) fingerprint.gpu = gpu
  cachedFingerprint = fingerprint
  return fingerprint
}

export function isDeviceSigningSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof indexedDB !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined'
  )
}

/**
 * Signs one request. Returns the headers to attach, or `null` when this
 * browser can't hold a device key (the backend then rejects app requests).
 */
export async function getDeviceSignatureHeaders(method: string, url: string): Promise<Record<string, string> | null> {
  const deviceId = getDeviceUuid()
  if (!deviceId || !isDeviceSigningSupported()) {
    return null
  }

  try {
    const db = await getDb()
    await ensureRecord(db)
    const record = await takeCounter(db)
    const path = new URL(url, window.location.origin).pathname
    const payload = `trinity-device-v1\n${deviceId}\n${record.counter}\n${method.toUpperCase()}\n${path}`
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      record.privateKey,
      new TextEncoder().encode(payload)
    )
    const { kty, crv, x, y } = record.publicJwk

    return {
      [deviceHeaderNames.id]: deviceId,
      [deviceHeaderNames.counter]: String(record.counter),
      [deviceHeaderNames.signature]: base64Url(signature),
      [deviceHeaderNames.key]: base64UrlJson({ kty, crv, x, y }),
      [deviceHeaderNames.fingerprint]: base64UrlJson(readFingerprint())
    }
  } catch {
    return null
  }
}
