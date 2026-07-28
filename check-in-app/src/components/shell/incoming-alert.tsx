'use client'

import { BellRing, Clock, MapPin, User as UserIcon, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useListActiveEmergencies } from '@/generated/api/mobile/mobile'
import { useAuth } from '@/lib/auth/auth-provider'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useShell } from '@/lib/shell/shell-provider'

/** How often each device polls for OPEN alerts on its site. */
const POLL_MS = 10_000

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * Site-wide SOS watcher. Polls `GET /api/mobile/emergency/active` every
 * {@link POLL_MS} and, when an OPEN alert from *another* employee on the same
 * site exists, renders a full-screen incoming-SOS overlay (name, coordinates,
 * elapsed time, dismiss). Dismissing hides that alert id locally only — the
 * alert stays OPEN until the sender cancels it or the backoffice resolves it.
 *
 * The overlay sits below the sender's own broadcast screen (z 95), so a device
 * with its own active alert never sees its site's echo of it (own alerts are
 * also filtered out by user id).
 */
export function IncomingAlert() {
  const { t } = useI18n()
  const { online } = useShell()
  const { user } = useAuth()

  const activeQuery = useListActiveEmergencies({
    query: {
      enabled: online,
      refetchInterval: POLL_MS,
      refetchIntervalInBackground: true,
      staleTime: 0
    }
  })

  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [now, setNow] = useState(() => Date.now())

  const incoming = useMemo(() => {
    // Wait for the profile before filtering, otherwise the viewer's own alert
    // can transiently render as an incoming SOS while `user` is still null.
    if (!user) return null
    const emergencies = activeQuery.data?.emergencies ?? []
    return (
      emergencies.find(
        (alert) => alert.userId !== user.id && !dismissedIds.includes(alert.id)
      ) ?? null
    )
  }, [activeQuery.data, user, dismissedIds])

  // Tick the elapsed timer while an incoming alert is on screen.
  useEffect(() => {
    if (!incoming) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [incoming])

  if (!incoming) return null

  const empName = incoming.user?.fullName ?? t.alert_emp
  const gps = `${incoming.lat.toFixed(5)}, ${incoming.lng.toFixed(5)}`
  const elapsed = Math.max(
    0,
    Math.floor((now - new Date(incoming.triggeredAt).getTime()) / 1000)
  )
  const elapsedLabel = `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`

  const dismiss = () => setDismissedIds((prev) => [...prev, incoming.id])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 90,
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
        {t.incoming_tag}
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
        {t.incoming_title}
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
        {t.incoming_msg}
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
          value={gps}
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
        onClick={dismiss}
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
        {t.dismiss}
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
