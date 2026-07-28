'use client'

import { ArrowLeft, BellRing, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCreateEmergency } from '@/generated/api/mobile/mobile'
import { ApiError } from '@/lib/api/fetch-client'
import { useGeolocation } from '@/lib/geo/use-geolocation'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useShell } from '@/lib/shell/shell-provider'

/** Full circumference of the r=82 progress ring (2·π·82 ≈ 515.2). */
const RING_FULL = 515.2
/** Hold duration to fire the alert, in milliseconds. */
const HOLD_MS = 1500
/** Emergency category sent to the backend. */
const EMERGENCY_TYPE = 'PANIC'

/**
 * Full-screen SOS panel (per the prototype's `onHome` `sosOpen` block).
 *
 * A hold-to-trigger circular button drives an SVG progress ring via
 * `requestAnimationFrame`. Holding for {@link HOLD_MS} fires the emergency: it
 * sends the current GPS fix through {@link useCreateEmergency} (when online),
 * flips the shell into the active-alert state, and closes the panel. When the
 * simulated connection is offline the alert is queued instead (the active-alert
 * overlay renders the queued variant).
 *
 * Visible while `useShell().sos.open`.
 */
export function SosPanel() {
  const { t } = useI18n()
  const { sos, online, setActiveAlert } = useShell()
  const { coords, request } = useGeolocation()
  const createEmergency = useCreateEmergency()

  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [firing, setFiring] = useState(false)

  const holdingRef = useRef(false)
  const startRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const tickRef = useRef<() => void>(() => {})
  const coordsRef = useRef(coords)

  // Keep the latest fix available to the (imperative) fire handler.
  useEffect(() => {
    coordsRef.current = coords
  }, [coords])

  // Grab a fresh fix as soon as the panel opens so coordinates are ready.
  useEffect(() => {
    if (sos.open) request()
  }, [sos.open, request])

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const fire = useCallback(async () => {
    if (firing) return
    setFiring(true)
    holdingRef.current = false
    stopRaf()
    setHolding(false)
    setProgress(1)

    const point = coordsRef.current
    const lat = point?.lat ?? 0
    const lng = point?.lng ?? 0

    // Offline → queue locally; the active-alert overlay shows the queued state.
    if (!online) {
      setActiveAlert('queued')
      sos.close()
      setProgress(0)
      setFiring(false)
      return
    }

    try {
      const { emergencyLog } = await createEmergency.mutateAsync({
        data: {
          lat,
          lng,
          emergencyType: EMERGENCY_TYPE,
          triggeredAt: new Date().toISOString()
        }
      })
      setActiveAlert('active', emergencyLog.id)
      sos.close()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : t.emergency
      toast.error(message)
    } finally {
      setProgress(0)
      setFiring(false)
    }
  }, [firing, online, createEmergency, setActiveAlert, sos, stopRaf, t])

  const tick = useCallback(() => {
    if (!holdingRef.current) return
    const now = performance.now()
    const p = Math.min(1, (now - startRef.current) / HOLD_MS)
    setProgress(p)
    if (p >= 1) {
      void fire()
      return
    }
    rafRef.current = requestAnimationFrame(() => tickRef.current())
  }, [fire])

  // Stable indirection so the rAF loop never closes over a stale `tick`.
  useEffect(() => {
    tickRef.current = tick
  }, [tick])

  const holdStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      if (firing) return
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // ignore
      }
      holdingRef.current = true
      startRef.current = performance.now()
      setHolding(true)
      setProgress(0)
      stopRaf()
      rafRef.current = requestAnimationFrame(() => tickRef.current())
    },
    [firing, stopRaf]
  )

  const holdEnd = useCallback(() => {
    holdingRef.current = false
    stopRaf()
    setHolding(false)
    if (!firing) setProgress(0)
  }, [stopRaf, firing])

  // Clean up the animation frame on unmount / close.
  useEffect(() => {
    if (!sos.open) {
      holdingRef.current = false
      stopRaf()
      setHolding(false)
      setProgress(0)
    }
    return () => stopRaf()
  }, [sos.open, stopRaf])

  if (!sos.open) return null

  const ringOffset = RING_FULL * (1 - progress)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 78,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: '58px 26px 30px',
        animation: 'rm-fade .22s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <button
          type="button"
          onClick={sos.close}
          aria-label={t.cancel}
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: '1px solid var(--trinity-border)',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flex: 'none'
          }}
        >
          <ArrowLeft size={19} color="var(--trinity-fg)" />
        </button>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--trinity-danger)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <TriangleAlert size={19} />
          {t.emergency}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 180,
            height: 180,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <svg
            width="180"
            height="180"
            viewBox="0 0 180 180"
            style={{
              position: 'absolute',
              inset: 0,
              transform: 'rotate(-90deg)',
              pointerEvents: 'none'
            }}
          >
            <circle
              cx="90"
              cy="90"
              r="82"
              fill="none"
              stroke="var(--trinity-danger-bg)"
              strokeWidth="9"
            />
            <circle
              cx="90"
              cy="90"
              r="82"
              fill="none"
              stroke="var(--trinity-danger)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={RING_FULL}
              strokeDashoffset={ringOffset}
              style={{
                transition: holding ? '0s' : 'stroke-dashoffset 0.3s ease'
              }}
            />
          </svg>
          <button
            type="button"
            onPointerDown={holdStart}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            onPointerCancel={holdEnd}
            style={{
              width: 148,
              height: 148,
              borderRadius: '50%',
              background: 'var(--trinity-danger)',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              cursor: 'pointer',
              userSelect: 'none',
              touchAction: 'none'
            }}
          >
            <BellRing size={42} />
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginTop: 5,
                letterSpacing: '1.5px'
              }}
            >
              SOS
            </div>
          </button>
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: 'var(--trinity-mfg)',
            textAlign: 'center',
            lineHeight: '20px',
            maxWidth: 260
          }}
        >
          {t.panic_hint}
        </div>
      </div>
    </div>
  )
}
