/**
 * Shared attendance derivations used by both Home and Attendance so the two
 * screens always agree on "today's status". All display strings are passed in
 * from the caller's `useI18n().t` — this module stays i18n-agnostic.
 */

import type { AttendanceDay, AttendanceEvent } from '@/generated/api/model'
import type { LatLng } from '@/components/map/geofence-map'

/** A non-null attendance event (the generated type is `… | null`). */
export type AttendanceEventValue = NonNullable<AttendanceEvent>

/** Drop the nullable holes orval bakes into the shared `AttendanceEvent` type. */
function nonNull(events: AttendanceEvent[]): AttendanceEventValue[] {
  return events.filter((event): event is AttendanceEventValue => event != null)
}

/** Derived check-in/out state for "today". */
export type TodayStatus = 'not-checked-in' | 'checked-in' | 'checked-out'

/** Local YYYY-MM-DD for the given date (matches backend `workDate`). */
export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Newest-first sort by workDate (backend already sorts, but be defensive). */
export function sortDaysDesc(days: AttendanceDay[]): AttendanceDay[] {
  return [...days].sort((a, b) => (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0))
}

/** The attendance row for today, if any. */
export function findTodayDay(days: AttendanceDay[]): AttendanceDay | undefined {
  const todayKey = localDateKey(new Date())
  return days.find((d) => d.workDate === todayKey)
}

/** Today's events, most recent first (a day may hold several in/out cycles). */
export function todayEventsDesc(days: AttendanceDay[]): AttendanceEventValue[] {
  const today = findTodayDay(days)
  if (!today) {
    return []
  }
  return nonNull(today.events).sort(
    (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
  )
}

/**
 * Whether the user is currently checked in (their most recent event today is a
 * CHECK_IN). This — not `deriveTodayStatus` — decides which action button shows,
 * so users can check in and out repeatedly during the day.
 */
export function isCheckedInNow(days: AttendanceDay[]): boolean {
  const events = todayEventsDesc(days)
  return events.length > 0 && events[0].type === 'CHECK_IN'
}

/**
 * Today's display status, from the most recent event:
 * - last event is CHECK_IN  → 'checked-in'
 * - last event is CHECK_OUT → 'checked-out'
 * - no events today         → 'not-checked-in'
 */
export function deriveTodayStatus(days: AttendanceDay[]): TodayStatus {
  const events = todayEventsDesc(days)
  if (events.length === 0) {
    return 'not-checked-in'
  }
  return events[0].type === 'CHECK_IN' ? 'checked-in' : 'checked-out'
}

/** Format an ISO timestamp as HH:mm in the active locale. */
export function fmtTime(iso: string, lang: 'th' | 'en'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return '—'
  }
  return d.toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Format a duration in seconds as "1h 20m" / "1 ชม. 20 นาที" in the active locale. */
export function fmtDuration(totalSeconds: number, lang: 'th' | 'en'): string {
  const totalMinutes = Math.max(0, Math.floor(totalSeconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (lang === 'th') {
    if (hours === 0 && minutes === 0) return 'น้อยกว่า 1 นาที'
    return [hours > 0 ? `${hours} ชม.` : null, hours === 0 || minutes > 0 ? `${minutes} นาที` : null]
      .filter(Boolean)
      .join(' ')
  }

  if (hours === 0 && minutes === 0) return '<1m'
  return [hours > 0 ? `${hours}h` : null, hours === 0 || minutes > 0 ? `${minutes}m` : null]
    .filter(Boolean)
    .join(' ')
}

/** Whether an event landed inside its work area (validation status OK). */
export function isInside(event: AttendanceEventValue): boolean {
  return event.validationStatus === 'VALID'
}

/**
 * The most recent work-area polygon + its centroid, scanned newest-first across
 * the user's events. Drives the check-in sheet map when the user has history.
 */
export function latestWorkArea(days: AttendanceDay[]): { polygon: LatLng[]; center: LatLng } | null {
  for (const day of sortDaysDesc(days)) {
    const dayEvents = nonNull(day.events)
    const event = dayEvents[dayEvents.length - 1] ?? day.checkOut ?? day.checkIn
    const nodes = event?.workAreaSnapshot?.areaNodes
    if (nodes && nodes.length >= 3) {
      const polygon = nodes.map((n) => ({ lat: n.lat, lng: n.lng }))
      const center = {
        lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length,
        lng: polygon.reduce((s, p) => s + p.lng, 0) / polygon.length
      }
      return { polygon, center }
    }
  }
  return null
}

/** Ray-casting point-in-polygon test (lat/lng treated as planar). */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng
    const yi = polygon[i].lat
    const xj = polygon[j].lng
    const yj = polygon[j].lat
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** A single row rendered in the history lists (Home recent + Attendance). */
export type AttendanceRow = {
  id: string
  isCheckIn: boolean
  /** Localized "Check in" / "Check out". */
  label: string
  /** Localized day label ("Today" / "Yesterday" / date). */
  meta: string
  /** HH:mm. */
  time: string
  /** Inside / Outside tag text, or the review status for the day. */
  tag: string
  inside: boolean
  /** Name of the work location the event's snapshot points at, or null if unresolved. */
  workLocationName: string | null
  /** How long the check-in this closes lasted, in seconds. Only set on check-out rows. */
  durationSeconds: number | null
}

function dayMeta(workDate: string, lang: 'th' | 'en', todayLabel: string, yesterdayLabel: string): string {
  const today = localDateKey(new Date())
  const yesterday = localDateKey(new Date(Date.now() - 86400000))
  if (workDate === today) return todayLabel
  if (workDate === yesterday) return yesterdayLabel
  const d = new Date(`${workDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return workDate
  return d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: '2-digit',
    month: 'short'
  })
}

/**
 * Flatten attendance days into individual check-in/out rows, newest first.
 * Every event is listed (a day can hold multiple in/out cycles), so the list
 * reads like a full activity feed mirroring the prototype.
 */
export function toRows(
  days: AttendanceDay[],
  lang: 'th' | 'en',
  labels: { recIn: string; recOut: string; today: string; yesterday: string; tagIn: string; tagOut: string }
): AttendanceRow[] {
  const rows: AttendanceRow[] = []
  for (const day of sortDaysDesc(days)) {
    const meta = dayMeta(day.workDate, lang, labels.today, labels.yesterday)
    const locationNameById = new Map(day.workLocations.map((loc) => [loc.id, loc.name]))
    const eventsDesc = nonNull(day.events).sort(
      (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
    )
    for (const event of eventsDesc) {
      const isCheckIn = event.type === 'CHECK_IN'
      const inside = isInside(event)
      const workLocationId = event.workAreaSnapshot?.workLocationId
      rows.push({
        id: event.id,
        isCheckIn,
        label: isCheckIn ? labels.recIn : labels.recOut,
        meta,
        time: fmtTime(event.capturedAt, lang),
        tag: inside ? labels.tagIn : labels.tagOut,
        inside,
        workLocationName: workLocationId ? (locationNameById.get(workLocationId) ?? null) : null,
        durationSeconds: event.durationSeconds
      })
    }
  }
  return rows
}
