'use client'

import {
  BellRing,
  Clock,
  CloudOff,
  LoaderCircle,
  MapPin,
  User as UserIcon,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useGetFrontendProfile } from '@/generated/api/frontend/frontend'
import { useCancelEmergency, useCreateEmergency } from '@/generated/api/mobile/mobile'
import { ApiError } from '@/lib/api/fetch-client'
import { useGeolocation } from '@/lib/geo/use-geolocation'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useShell } from '@/lib/shell/shell-provider'

/** Emergency category sent to the backend (matches the SOS panel). */
const EMERGENCY_TYPE = 'PANIC'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * Emergency broadcast overlay (per `<!-- ===== ACTIVE ALERT ===== -->` and the
 * `QUEUED (OFFLINE)` variant beneath it).
 *
 * Renders whenever `useShell().activeAlert !== 'none'`:
 *  - `'active'`  → red broadcasting screen with employee / coordinates / elapsed
 *    timer and a cancel button.
 *  - `'queued'`  → dark offline screen explaining the alert is queued; reconnect
 *    (toggling `online` true) sends the queued emergency to the backend and
 *    promotes it to `'active'`; cancel clears it.
 *
 * Cancelling an `'active'` alert resolves the backend emergency log (so it
 * stops broadcasting to teammates) before clearing the local state.
 */
export function ActiveAlert() {
  const { t } = useI18n()
  const { activeAlert, activeAlertId, setActiveAlert, online } = useShell()
  const { coords, request } = useGeolocation()
  const profile = useGetFrontendProfile()
  const createEmergency = useCreateEmergency()
  const cancelEmergency = useCancelEmergency()

  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)
  const prevState = useRef(activeAlert)
  const sendingRef = useRef(false)
  const coordsRef = useRef(coords)

  // Keep the latest fix available to the queued-send effect.
  useEffect(() => {
    coordsRef.current = coords
  }, [coords])

  const empName = profile.data?.user.fullName ?? t.alert_emp

  // Start / reset the elapsed timer when the alert becomes active.
  useEffect(() => {
    if (activeAlert === 'active') {
      if (startRef.current == null) {
        startRef.current = Date.now()
        setElapsed(0)
      }
      const id = window.setInterval(() => {
        if (startRef.current != null) {
          setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
        }
      }, 1000)
      return () => window.clearInterval(id)
    }
    if (activeAlert === 'none') {
      startRef.current = null
      setElapsed(0)
    }
  }, [activeAlert])

  // Refresh the live coordinate while broadcasting.
  useEffect(() => {
    if (activeAlert !== 'none') request()
  }, [activeAlert, request])

  // Reconnecting while queued sends the emergency for real, then promotes the
  // alert to active with the created log id (so cancel can resolve it).
  // Depends on the stable `mutateAsync` (not the mutation object, whose identity
  // changes every render) so a failed send doesn't re-trigger in a retry loop —
  // it re-runs only when connectivity or the alert state changes.
  const sendEmergency = createEmergency.mutateAsync
  useEffect(() => {
    if (!online || activeAlert !== 'queued' || sendingRef.current) return
    sendingRef.current = true
    const point = coordsRef.current
    sendEmergency({
        data: {
          lat: point?.lat ?? 0,
          lng: point?.lng ?? 0,
          emergencyType: EMERGENCY_TYPE,
          triggeredAt: new Date().toISOString()
        }
      })
      .then(({ emergencyLog }) => {
        startRef.current = Date.now()
        setElapsed(0)
        setActiveAlert('active', emergencyLog.id)
        toast.success(t.t_alert_sent)
      })
      .catch((error: unknown) => {
        toast.error(error instanceof ApiError ? error.message : t.emergency)
      })
      .finally(() => {
        sendingRef.current = false
      })
  }, [online, activeAlert, sendEmergency, setActiveAlert, t])

  // Toast on transition back to 'none' via cancel (not on initial mount).
  useEffect(() => {
    if (prevState.current !== 'none' && activeAlert === 'none') {
      toast.success(t.t_cancel)
    }
    prevState.current = activeAlert
  }, [activeAlert, t])

  if (activeAlert === 'none') return null

  // Resolve the backend log first so teammates stop seeing the alert; a queued
  // (never-sent) alert has no backend row and is cleared locally.
  const cancel = () => {
    if (activeAlert === 'active' && activeAlertId) {
      if (cancelEmergency.isPending) return
      cancelEmergency.mutate(
        { emergencyLogId: activeAlertId },
        {
          onSuccess: () => setActiveAlert('none'),
          onError: (error: unknown) => {
            toast.error(error instanceof ApiError ? error.message : t.emergency)
          }
        }
      )
      return
    }
    setActiveAlert('none')
  }
  const liveGps = coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : '—'
  const elapsedLabel = `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`

  if (activeAlert === 'queued') {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 95,
          background: '#171A20',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '78px 26px 34px',
          animation: 'rm-fade .25s ease'
        }}
      >
        <div
          style={{
            width: 104,
            height: 104,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <CloudOff size={44} color="#fff" />
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 13,
            fontWeight: 600,
            color: '#ffd166',
            letterSpacing: '1px',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <LoaderCircle
            size={15}
            style={{ animation: 'rm-spin 1s linear infinite' }}
          />
          {t.queued_tag}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 22,
            fontWeight: 600,
            color: '#fff',
            textAlign: 'center'
          }}
        >
          {t.queued_title}
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: 'rgba(255,255,255,.78)',
            textAlign: 'center',
            lineHeight: '20px'
          }}
        >
          {t.queued_msg}
        </div>
        <div
          style={{
            marginTop: 20,
            border: '1px dashed rgba(255,255,255,.25)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 11.5,
            color: 'rgba(255,255,255,.6)',
            lineHeight: '17px',
            textAlign: 'center'
          }}
        >
          {t.queued_note}
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={cancel}
          style={{
            marginTop: 9,
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,.6)',
            background: 'none',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          {t.cancel_alert}
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 95,
        background: '#c8102e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '78px 26px 34px',
        animation: 'rm-fade .25s ease'
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 140,
          height: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <span
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.4)',
            animation: 'rm-pulse 2s ease-out infinite'
          }}
        />
        <span
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.4)',
            animation: 'rm-pulse 2s ease-out infinite 1s'
          }}
        />
        <div
          style={{
            width: 104,
            height: 104,
            borderRadius: '50%',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <BellRing size={46} color="var(--trinity-danger)" />
        </div>
      </div>

      <div
        style={{
          marginTop: 26,
          fontSize: 13,
          fontWeight: 600,
          color: '#fff',
          letterSpacing: '2px',
          animation: 'rm-blink 1.4s infinite'
        }}
      >
        {t.broadcasting}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 25,
          fontWeight: 600,
          color: '#fff',
          textAlign: 'center'
        }}
      >
        {t.alert_active}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 13.5,
          color: 'rgba(255,255,255,.85)',
          textAlign: 'center',
          lineHeight: '19px'
        }}
      >
        {t.alert_sent}
      </div>

      <div
        style={{
          marginTop: 24,
          width: '100%',
          background: 'rgba(255,255,255,.13)',
          borderRadius: 10,
          padding: 15,
          color: '#fff'
        }}
      >
        <Row icon={<UserIcon size={15} />} label={t.alert_emp} value={empName} />
        <Row
          icon={<MapPin size={15} />}
          label={t.alert_loc}
          value={liveGps}
          divider
          mono
        />
        <Row
          icon={<Clock size={15} />}
          label={t.alert_time}
          value={elapsedLabel}
          divider
          mono
        />
      </div>

      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={cancel}
        style={{
          width: '100%',
          height: 52,
          borderRadius: 4,
          background: '#fff',
          color: 'var(--trinity-danger)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        <X size={20} />
        {t.cancel_alert}
      </button>
    </div>
  )
}

function Row({
  icon,
  label,
  value,
  divider,
  mono
}: {
  icon: React.ReactNode
  label: string
  value: string
  divider?: boolean
  mono?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 0',
        borderTop: divider ? '1px solid rgba(255,255,255,.15)' : undefined
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          opacity: 0.8,
          display: 'flex',
          alignItems: 'center',
          gap: 7
        }}
      >
        {icon}
        {label}
      </span>
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          fontVariantNumeric: mono ? 'tabular-nums' : undefined
        }}
      >
        {value}
      </span>
    </div>
  )
}
