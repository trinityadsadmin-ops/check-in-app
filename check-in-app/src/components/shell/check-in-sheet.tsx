'use client'

import { Check, Loader2, Signal, SignalLow } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import GeofenceMap from '@/components/map/geofence-map'
import type { LatLng } from '@/components/map/geofence-map'
import { useCheckIn, useCheckOut } from '@/generated/api/mobile/mobile'
import {
  useGetFrontendWorkAreas,
  useListFrontendAttendance
} from '@/generated/api/frontend/frontend'
import { ApiError } from '@/lib/api/fetch-client'
import { useGeolocation } from '@/lib/geo/use-geolocation'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useShell } from '@/lib/shell/shell-provider'
import { latestWorkArea, pointInPolygon } from '@/features/attendance/attendance-utils'

// Default centre when the user has no history and no fix yet (central Bangkok).
const FALLBACK_CENTER: LatLng = { lat: 13.7563, lng: 100.5018 }

/**
 * Bottom-sheet geofence verification. Confirm submits the check-in/out punch
 * directly (no photo required). Visible whenever `useShell().sheet` is
 * 'in' | 'out'. Mounted by the integrate phase via AppShell's `overlays` slot.
 */
export function CheckInSheet() {
  const { t, lang } = useI18n()
  const { sheet, closeSheet } = useShell()
  const { coords, status, request } = useGeolocation()
  const queryClient = useQueryClient()

  const isOpen = sheet === 'in' || sheet === 'out'

  const position = coords ? { lat: coords.lat, lng: coords.lng } : null

  // Prefer the assigned polygon containing the current GPS fix, then the first
  // current assignment for the initial map view. Attendance history is only
  // used when the user has no current assignment at all — it must never
  // substitute for a live assignment, since a stale snapshot polygon (from
  // before a site's geofence was edited, or from a different site) could
  // contain the current point while the live assignment does not, showing
  // "inside" client-side while the server (which only checks live
  // assignments) correctly rejects the check-in.
  const attendanceQuery = useListFrontendAttendance({ perPage: 30 })
  const assignedQuery = useGetFrontendWorkAreas()
  const workArea = useMemo(() => {
    const assignments = assignedQuery.data?.workAreas ?? []

    if (assignments.length === 0) {
      return latestWorkArea(attendanceQuery.data?.attendanceDays ?? [])
    }

    const matchedArea = position
      ? assignments.find(({ workArea: area }) =>
          pointInPolygon(position, area.areaNodes.map((node) => ({ lat: node.lat, lng: node.lng })))
        )
      : null
    const nodes = (matchedArea ?? assignments[0]).workArea.areaNodes

    if (nodes && nodes.length > 0) {
      const polygon = nodes.map((n) => ({ lat: n.lat, lng: n.lng }))
      const center = {
        lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length,
        lng: polygon.reduce((s, p) => s + p.lng, 0) / polygon.length
      }
      return { polygon, center }
    }
    return latestWorkArea(attendanceQuery.data?.attendanceDays ?? [])
  }, [assignedQuery.data?.workAreas, attendanceQuery.data?.attendanceDays, position])

  const checkInMutation = useCheckIn()
  const checkOutMutation = useCheckOut()
  const [submitting, setSubmitting] = useState(false)

  // Request a fresh GPS fix each time the sheet opens.
  useEffect(() => {
    if (isOpen) {
      request()
    }
  }, [isOpen, request])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isOpen) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const center = position ?? workArea?.center ?? FALLBACK_CENTER
  const polygon = workArea?.polygon

  // Inside/outside: if we have both a polygon and a fix, test geometrically;
  // otherwise treat a successful fix as inside (backend is the real authority).
  const inside =
    polygon && position ? pointInPolygon(position, polygon) : status === 'ok'

  const weak = typeof coords?.accuracy === 'number' && coords.accuracy > 30
  const geoFg = inside ? 'var(--trinity-success)' : 'var(--trinity-danger)'
  const geoBg = inside ? 'var(--trinity-success-bg)' : 'var(--trinity-danger-bg)'
  const geoBd = inside ? 'var(--trinity-success-bd)' : 'var(--trinity-danger-bd)'
  const geoStatus =
    status === 'locating'
      ? t.locating
      : status === 'denied'
        ? t.geo_denied
        : inside
          ? t.geo_inside
          : t.geo_outside

  const sheetTitle = sheet === 'in' ? t.sheet_in : t.sheet_out
  const confirmLabel = sheet === 'in' ? t.confirm_in : t.confirm_out

  const clock = new Date(now).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  })

  const canConfirm = !!position && !submitting && status !== 'locating'

  // Confirm location → submit the check-in/out punch directly (no photo).
  const onConfirm = async () => {
    if (!position) {
      toast.error(t.locating)
      request()
      return
    }
    setSubmitting(true)
    try {
      const body = {
        lat: position.lat,
        lng: position.lng,
        capturedAt: new Date().toISOString()
      }
      if (sheet === 'in') {
        await checkInMutation.mutateAsync({ data: body })
      } else {
        await checkOutMutation.mutateAsync({ data: body })
      }

      await queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === '/api/frontend/attendance'
      })
      toast.success(t.t_saved)
      closeSheet()
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error(t.outside_area)
      } else {
        const message = error instanceof Error ? error.message : t.geo_denied
        toast.error(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="absolute inset-0 flex flex-col justify-end"
      style={{ zIndex: 80 }}
    >
      <button
        type="button"
        aria-label={t.cancel}
        onClick={closeSheet}
        className="absolute inset-0"
        style={{ background: 'rgba(8,12,20,.5)', animation: 'rm-fade .2s ease' }}
      />
      <div
        className="rm-scroll relative"
        style={{
          background: '#fff',
          borderRadius: '8px 12px 0 0',
          padding: '8px 18px 26px',
          animation: 'rm-sheet .28s cubic-bezier(.16,1,.3,1)',
          maxHeight: '92%',
          overflowY: 'auto'
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            background: 'var(--trinity-border2)',
            margin: '6px auto 14px'
          }}
        />
        <div className="flex items-center justify-between">
          <div style={{ fontSize: 18, fontWeight: 600 }}>{sheetTitle}</div>
          <div
            className="inline-flex items-center"
            style={{
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 10px',
              borderRadius: 8,
              background: geoBg,
              color: geoFg,
              border: `1px solid ${geoBd}`
            }}
          >
            <span
              style={{ width: 7, height: 7, borderRadius: '50%', background: geoFg }}
              aria-hidden
            />
            {geoStatus}
          </div>
        </div>

        {/* real geofence map */}
        <div
          className="relative"
          style={{
            marginTop: 14,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--trinity-border)',
            height: 212
          }}
        >
          <GeofenceMap
            center={center}
            polygon={polygon}
            position={position ?? undefined}
            inside={inside}
            height={212}
          />
          <div
            className="absolute inline-flex items-center"
            style={{
              top: 10,
              left: 10,
              gap: 6,
              background: 'rgba(255,255,255,.92)',
              padding: '5px 9px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600
            }}
          >
            {weak ? (
              <SignalLow size={14} color="var(--trinity-warn)" />
            ) : (
              <Signal size={14} color="var(--trinity-success)" />
            )}
            {weak ? t.gps_weak : t.gps_strong}
          </div>
        </div>

        {/* weak GPS warning */}
        {weak ? (
          <div
            className="flex"
            style={{
              marginTop: 12,
              border: '1px solid var(--trinity-warn-bg)',
              background: 'var(--trinity-warn-bg)',
              borderRadius: 8,
              padding: '11px 12px',
              gap: 9
            }}
          >
            <SignalLow size={17} color="var(--trinity-warn)" style={{ flex: 'none', marginTop: 1 }} />
            <div style={{ fontSize: 12, lineHeight: '17px', color: '#6b4d00' }}>{t.weak_warn}</div>
          </div>
        ) : null}

        {/* meta rows */}
        <div
          style={{
            marginTop: 13,
            background: 'var(--trinity-muted2)',
            border: '1px solid var(--trinity-border)',
            borderRadius: 8,
            padding: '4px 13px'
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{ padding: '9px 0', borderBottom: '1px solid var(--trinity-border)' }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--trinity-mfg)' }}>{t.location_status}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: geoFg }}>{geoStatus}</span>
          </div>
          <div className="flex items-center justify-between" style={{ padding: '9px 0' }}>
            <span style={{ fontSize: 12.5, color: 'var(--trinity-mfg)' }}>{t.timestamp}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {clock}
            </span>
          </div>
        </div>

        {/* actions */}
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={closeSheet}
            className="flex flex-1 items-center justify-center"
            style={{
              height: 50,
              borderRadius: 4,
              border: '1px solid var(--trinity-border)',
              fontSize: 15,
              fontWeight: 600,
              background: '#fff'
            }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={!canConfirm}
            className="flex items-center justify-center"
            style={{
              flex: 1.5,
              height: 50,
              borderRadius: 4,
              background: 'var(--trinity-primary)',
              color: '#fff',
              gap: 8,
              fontSize: 15,
              fontWeight: 600,
              opacity: canConfirm ? 1 : 0.6
            }}
          >
            {submitting ? (
              <Loader2 size={19} style={{ animation: 'rm-spin 1s linear infinite' }} />
            ) : (
              <Check size={19} />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CheckInSheet
