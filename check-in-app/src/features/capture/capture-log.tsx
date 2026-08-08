'use client'

import { Camera, Clock, History, MapPin, Trash2, X } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  CameraCapture,
  type CapturedPhoto
} from '@/components/shell/camera-capture'
import {
  useGetFrontendProfile,
  useListSiteAreaInspections
} from '@/generated/api/frontend/frontend'
import {
  useCreateAreaInspection,
  useCreateAreaInspectionUploadUrl,
  useDeleteAreaInspection
} from '@/generated/api/mobile/mobile'
import type {
  AreaInspection,
  CreateAreaInspectionUploadUrlRequestContentType
} from '@/generated/api/model'
import { ApiError } from '@/lib/api/fetch-client'
import { useI18n } from '@/lib/i18n/i18n-provider'
import type { Lang } from '@/lib/i18n/dictionaries'

/** A normalized entry rendered in the photo log. */
type LogEntry = {
  id: string
  photoUrl: string | null
  /** Background gradient when no real photo is available. */
  bg: string
  gps: string
  /** HH:MM stamp. */
  stamp: string
  /** Capture moment, used for the relative "ago" label and delete window. */
  capturedAt: number
  who: string
  whoInitials: string
  notes: string | null
  /** True for the signed-in user's own entries (server- or locally-created). */
  mine: boolean
  /** Locally-created, not yet persisted — only removable client-side. */
  local: boolean
}

const GRADIENTS = [
  'linear-gradient(135deg,#5b6b7a,#39424d)',
  'linear-gradient(135deg,#7a6a5b,#4d4239)',
  'linear-gradient(135deg,#5b727a,#394a4d)',
  'linear-gradient(135deg,#6a5b7a,#42394d)'
]

/** Staff can delete their own reports for 15 minutes after capture. */
const DELETE_WINDOW_MS = 15 * 60 * 1000

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function gpsLabel(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null) return '—'
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

function timeLabel(iso: string | number, lang: Lang): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function dateTimeLabel(capturedAt: number, lang: Lang): string {
  return new Date(capturedAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function agoLabel(capturedAt: number, now: number, lang: Lang): string {
  const mins = Math.floor((now - capturedAt) / 60000)
  if (mins < 1) return lang === 'th' ? 'เมื่อสักครู่' : 'just now'
  if (mins < 60) return mins + (lang === 'th' ? ' นาทีที่แล้ว' : 'm ago')
  return Math.floor(mins / 60) + (lang === 'th' ? ' ชม.ที่แล้ว' : 'h ago')
}

const CONTENT_TYPE_BY_MIME: Record<string, CreateAreaInspectionUploadUrlRequestContentType> =
  {
    'image/jpeg': 'image/jpeg',
    'image/png': 'image/png',
    'image/webp': 'image/webp'
  }

function DetailRow({
  icon,
  label,
  value
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: 'var(--trinity-mfg2)', display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 12.5, color: 'var(--trinity-mfg2)', width: 72 }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          color: 'var(--trinity-fg)',
          fontVariantNumeric: 'tabular-nums',
          flex: 1
        }}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Full-screen detail for a tapped area-inspection report: large photo plus
 * who/when/where and notes. Portals into the device frame so it covers the whole
 * screen (above the shell chrome), matching the camera overlay convention.
 */
function InspectionDetail({
  entry,
  lang,
  onClose
}: {
  entry: LogEntry
  lang: Lang
  onClose: () => void
}) {
  // Detail only mounts after a tap (client-side), so the frame target exists.
  const target =
    typeof document === 'undefined'
      ? null
      : (document.getElementById('trinity-frame-content') ?? document.body)

  if (!target) return null

  const L = (th: string, en: string) => (lang === 'th' ? th : en)

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 90,
        background: 'rgba(8,12,20,.55)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'rm-fade .2s ease'
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={L('ปิด', 'Close')}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          right: 16,
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: 'rgba(0,0,0,.5)',
          border: 'none',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1
        }}
      >
        <X size={20} />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          marginTop: 'auto',
          background: '#fff',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          overflow: 'hidden',
          animation: 'rm-sheet .25s ease',
          maxHeight: '90%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            background: entry.bg,
            width: '100%',
            aspectRatio: '4 / 3',
            position: 'relative',
            flex: 'none'
          }}
        >
          {entry.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.photoUrl}
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          )}
        </div>

        <div
          style={{
            padding: '16px 18px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            overflowY: 'auto'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'var(--trinity-primary-l)',
                color: 'var(--trinity-primary)',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {entry.whoInitials}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{entry.who}</div>
          </div>

          <DetailRow
            icon={<Clock size={15} />}
            label={L('เวลา', 'Captured')}
            value={dateTimeLabel(entry.capturedAt, lang)}
          />
          <DetailRow
            icon={<MapPin size={15} />}
            label={L('พิกัด', 'Location')}
            value={entry.gps}
          />

          {entry.notes ? (
            <div style={{ borderTop: '1px solid var(--trinity-muted)', paddingTop: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--trinity-mfg2)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px',
                  marginBottom: 6
                }}
              >
                {L('บันทึก', 'Notes')}
              </div>
              <div style={{ fontSize: 13.5, color: '#334155', lineHeight: '20px' }}>
                {entry.notes}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, target)
}

/**
 * AREA INSPECTION ("ตรวจพื้นที่") log — a feature separate from attendance
 * check-in photos. Staff capture ad-hoc site-condition reports; the log shows
 * the signed-in user's own upload history across all of their assigned work
 * sites ({@link useListSiteAreaInspections}). The signed-in user may delete
 * their own reports within a 15-minute window.
 */
export function CaptureLog() {
  const { t, lang } = useI18n()
  const profile = useGetFrontendProfile()
  const inspections = useListSiteAreaInspections({ perPage: 30 })
  const createUploadUrl = useCreateAreaInspectionUploadUrl()
  const createInspection = useCreateAreaInspection()
  const deleteInspection = useDeleteAreaInspection()

  const [cameraOpen, setCameraOpen] = useState(false)
  const [adHoc, setAdHoc] = useState<LogEntry[]>([])
  const [now, setNow] = useState(() => Date.now())
  // The report whose detail overlay is open (tap a log card to inspect).
  const [detail, setDetail] = useState<LogEntry | null>(null)

  // Keep relative timestamps / delete windows fresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const myId = profile.data?.user.id ?? null
  const myName = profile.data?.user.fullName ?? (lang === 'th' ? 'พนักงาน' : 'Staff')
  const myInitials = initials(myName)

  const siteEntries = useMemo<LogEntry[]>(() => {
    const rows = inspections.data?.areaInspections ?? []
    return rows.map((row: AreaInspection, index): LogEntry => {
      const who = row.user?.fullName ?? (lang === 'th' ? 'พนักงาน' : 'Staff')
      return {
        id: row.id,
        photoUrl: row.photoUrl,
        bg: GRADIENTS[index % GRADIENTS.length],
        gps: gpsLabel(row.lat, row.lng),
        stamp: timeLabel(row.capturedAt, lang),
        capturedAt: new Date(row.capturedAt).getTime(),
        who,
        whoInitials: initials(who),
        notes: row.notes,
        mine: row.user?.id != null && row.user.id === myId,
        local: false
      }
    })
  }, [inspections.data, lang, myId])

  const entries = useMemo<LogEntry[]>(
    () => [...adHoc, ...siteEntries],
    [adHoc, siteEntries]
  )

  const handleCapture = useCallback(
    async (photo: CapturedPhoto) => {
      const contentType = CONTENT_TYPE_BY_MIME[photo.blob.type] ?? 'image/jpeg'
      const localId = `local-${Date.now()}`
      const notes = photo.notes.trim() ? photo.notes.trim() : null
      // Optimistic local entry — shown immediately, replaced by the server row
      // once the report is persisted and the list refetches.
      const entry: LogEntry = {
        id: localId,
        photoUrl: photo.previewUrl,
        bg: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)],
        gps: gpsLabel(photo.lat, photo.lng),
        stamp: `${pad(photo.capturedAt.getHours())}:${pad(photo.capturedAt.getMinutes())}`,
        capturedAt: photo.capturedAt.getTime(),
        who: myName,
        whoInitials: myInitials,
        notes,
        mine: true,
        local: true
      }
      setAdHoc((prev) => [entry, ...prev])
      setCameraOpen(false)

      try {
        const { signedUploadUrl, pendingUploadId } = await createUploadUrl.mutateAsync({
          data: { contentType }
        })
        await fetch(signedUploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: photo.blob
        })
        await createInspection.mutateAsync({
          data: {
            pendingUploadId,
            lat: photo.lat ?? null,
            lng: photo.lng ?? null,
            notes,
            capturedAt: photo.capturedAt.toISOString()
          }
        })
        // Drop the optimistic entry and pull the persisted, site-wide list.
        setAdHoc((prev) => prev.filter((p) => p.id !== localId))
        if (entry.photoUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(entry.photoUrl)
        }
        await inspections.refetch()
        toast.success(t.t_photo)
      } catch (error) {
        // Keep the optimistic entry so the capture isn't lost from view; surface
        // the failure so the user knows it wasn't saved.
        const message = error instanceof ApiError ? error.message : t.login_failed
        toast.error(message)
      }
    },
    [createInspection, createUploadUrl, inspections, myInitials, myName, t]
  )

  const deleteEntry = useCallback(
    async (entry: LogEntry) => {
      if (entry.local) {
        setAdHoc((prev) => {
          const target = prev.find((p) => p.id === entry.id)
          if (target?.photoUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(target.photoUrl)
          }
          return prev.filter((p) => p.id !== entry.id)
        })
        toast.success(t.t_deleted)
        return
      }

      try {
        await deleteInspection.mutateAsync({ areaInspectionId: entry.id })
        await inspections.refetch()
        toast.success(t.t_deleted)
      } catch (error) {
        const message = error instanceof ApiError ? error.message : t.login_failed
        toast.error(message)
      }
    },
    [deleteInspection, inspections, t]
  )

  return (
    <div
      style={{
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}
    >
      <button
        type="button"
        onClick={() => setCameraOpen(true)}
        style={{
          height: 52,
          borderRadius: 4,
          background: 'var(--trinity-primary)',
          color: '#fff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        <Camera size={20} />
        {t.capture_title}
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 2
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--trinity-mfg)',
            textTransform: 'uppercase',
            letterSpacing: '.5px'
          }}
        >
          {t.log_title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--trinity-mfg2)',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          <History size={13} />
          {t.own_uploads}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {entries.map((ph) => {
          const ageMs = now - ph.capturedAt
          const canDelete = ph.mine && ageMs < DELETE_WINDOW_MS
          const remainMin = Math.max(0, Math.ceil((DELETE_WINDOW_MS - ageMs) / 60000))
          return (
            <div
              key={ph.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetail(ph)}
              style={{
                background: '#fff',
                border: '1px solid var(--trinity-border)',
                borderRadius: 8,
                overflow: 'hidden',
                cursor: 'pointer'
              }}
            >
              <div
                style={{
                  height: 124,
                  background: ph.bg,
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  padding: '8px 10px'
                }}
              >
                {ph.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ph.photoUrl}
                    alt=""
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                )}
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(0,0,0,.45)',
                    color: '#fff',
                    padding: '3px 7px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600
                  }}
                >
                  <MapPin size={11} />
                  {ph.gps}
                </div>
                <div
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    background: 'rgba(0,0,0,.45)',
                    color: '#fff',
                    padding: '3px 7px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {ph.stamp}
                </div>
                <div
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    background: 'rgba(0,0,0,.45)',
                    color: '#fff',
                    padding: '3px 7px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Camera size={11} />
                </div>
              </div>
              <div style={{ padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'var(--trinity-primary-l)',
                      color: 'var(--trinity-primary)',
                      fontSize: 10,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {ph.whoInitials}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{ph.who}</div>
                  <div style={{ fontSize: 11, color: 'var(--trinity-mfg)' }}>
                    {agoLabel(ph.capturedAt, now, lang)}
                  </div>
                </div>
                {ph.notes && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: '#334155',
                      marginTop: 8,
                      lineHeight: '18px'
                    }}
                  >
                    {ph.notes}
                  </div>
                )}
                {canDelete && (
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--trinity-muted)',
                      paddingTop: 9
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
                        color: 'var(--trinity-warn)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5
                      }}
                    >
                      <Clock size={12} />
                      {`${t.delete_window} ${remainMin}${lang === 'th' ? ' นาที' : 'm'}`}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteEntry(ph)
                      }}
                      disabled={deleteInspection.isPending}
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: 'var(--trinity-danger)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <Trash2 size={13} />
                      {t.delete}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {entries.length === 0 && !inspections.isLoading && (
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--trinity-border)',
              borderRadius: 8,
              padding: '28px 16px',
              textAlign: 'center',
              fontSize: 12.5,
              color: 'var(--trinity-mfg2)'
            }}
          >
            {t.viewfinder_hint}
          </div>
        )}
      </div>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCapture}
      />

      {detail ? (
        <InspectionDetail entry={detail} lang={lang} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  )
}
