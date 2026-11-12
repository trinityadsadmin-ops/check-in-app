/**
 * Two-phase action log, so "I pressed check-in" disputes can be settled:
 *
 * 1. INTENT — written the moment the employee presses a key-action button,
 *    with the phone's own clock.
 * 2. RESULT — what the app saw (success, or the failure and its error code).
 *
 * Every server call made for the action carries the same `X-Action-Id`, and
 * the backend independently records the RESULT it produced. Entries are queued
 * in localStorage and uploaded in the background, so actions taken while
 * offline (where the request never reached the server) are still recorded
 * once the phone is back online.
 */

import { getStoredSession } from '@/lib/api/session'
import { customFetch, getApiErrorCode } from '@/lib/api/fetch-client'

const QUEUE_KEY = 'trinity.action-log-queue'
const MAX_QUEUE = 300
const BATCH_SIZE = 50
const FLUSH_PATH = '/api/mobile/action-logs'

export const ACTION_ID_HEADER = 'X-Action-Id'

type QueuedLog = {
  actionId: string
  action: string
  phase: 'INTENT' | 'RESULT'
  outcome?: 'SUCCESS' | 'FAILURE'
  errorCode?: string
  errorMessage?: string
  clientAt: string
  metadata?: Record<string, unknown>
}

function readQueue(): QueuedLog[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as QueuedLog[]) : []
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedLog[]) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)))
  } catch {
    // Storage full/unavailable: the server-side RESULT is still recorded.
  }
}

function enqueue(entry: QueuedLog) {
  if (typeof window === 'undefined') {
    return
  }
  writeQueue([...readQueue(), entry])
  scheduleFlush()
}

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false

function scheduleFlush(delayMs = 1500) {
  if (flushTimer) {
    return
  }
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushActionLogs()
  }, delayMs)
}

/** Uploads queued entries. Safe to call any time; no-ops while signed out. */
export async function flushActionLogs() {
  if (typeof window === 'undefined' || flushing || !getStoredSession() || !navigator.onLine) {
    return
  }
  flushing = true
  try {
    for (;;) {
      const batch = readQueue().slice(0, BATCH_SIZE)
      if (batch.length === 0) {
        return
      }
      await customFetch(FLUSH_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: batch })
      })
      const sent = new Set(batch.map((log) => `${log.actionId}:${log.phase}:${log.action}`))
      writeQueue(readQueue().filter((log) => !sent.has(`${log.actionId}:${log.phase}:${log.action}`)))
    }
  } catch {
    // Keep the queue; retried on the next action, reconnect or app focus.
  } finally {
    flushing = false
  }
}

function errorDetails(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    errorCode: getApiErrorCode(error) ?? (error instanceof Error ? error.name : 'UNKNOWN'),
    errorMessage: message.slice(0, 1000)
  }
}

export type TrackedAction = {
  actionId: string
  /** Headers to send with every server call made for this action. */
  headers: Record<string, string>
  succeed: (metadata?: Record<string, unknown>) => void
  fail: (error: unknown, metadata?: Record<string, unknown>) => void
}

/** Records the INTENT now; call `succeed`/`fail` once the outcome is known. */
export function beginAction(action: string, metadata?: Record<string, unknown>): TrackedAction {
  const actionId = crypto.randomUUID()
  enqueue({ actionId, action, phase: 'INTENT', clientAt: new Date().toISOString(), metadata })
  let settled = false
  const settle = (entry: Omit<QueuedLog, 'actionId' | 'action' | 'phase' | 'clientAt'>) => {
    if (settled) {
      return
    }
    settled = true
    enqueue({ actionId, action, phase: 'RESULT', clientAt: new Date().toISOString(), ...entry })
  }
  return {
    actionId,
    headers: { [ACTION_ID_HEADER]: actionId },
    succeed: (meta) => settle({ outcome: 'SUCCESS', metadata: meta }),
    fail: (error, meta) => settle({ outcome: 'FAILURE', ...errorDetails(error), metadata: meta })
  }
}

/**
 * Runs `run` as one tracked action: INTENT before, RESULT after (rethrowing on
 * failure). Pass `action.headers` to each request `run` makes.
 */
export async function trackAction<T>(
  action: string,
  run: (tracked: TrackedAction) => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const tracked = beginAction(action, metadata)
  try {
    const result = await run(tracked)
    tracked.succeed()
    return result
  } catch (error) {
    tracked.fail(error)
    throw error
  }
}

/**
 * A key-action button press that failed in the app before any server call
 * (no GPS fix, camera denied, required field missing...).
 */
export function recordClientFailure(action: string, errorCode: string, metadata?: Record<string, unknown>) {
  const tracked = beginAction(action, metadata)
  const error = new Error(errorCode)
  error.name = errorCode
  tracked.fail(error)
}

/** Flushes on reconnect and whenever the app comes back to the foreground. */
export function installActionLogFlush() {
  if (typeof window === 'undefined') {
    return () => {}
  }
  const onOnline = () => void flushActionLogs()
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void flushActionLogs()
    }
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  void flushActionLogs()
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
