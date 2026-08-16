import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'
import { badRequest, forbidden, notFound } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { writeAuditLog, writeEventLog } from '../logs/logs.service.js'
import { findActiveWorkAreaForPoint } from '../work-locations/work-location-assignment.service.js'
import { getBangkokDate, type LatLngNode } from './geo.js'
import type {
  AttendanceEventType,
  ConfirmAttendanceRequest,
  CreateAttendanceUploadUrlRequest,
  ListAttendanceQuery,
  ReviewAttendanceRequest
} from './attendance.schemas.js'
import type { Context } from 'hono'
import type { AppEnv } from '../../types/hono.js'

type PhotoUploadRow = {
  id: string
  user_id: string
  event_type: AttendanceEventType
  storage_bucket: string
  storage_path: string
  content_type: string
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED'
  expires_at: string
  upload_expires_at: string
}

type AttendanceEventRow = {
  id: string
  attendance_day_id: string
  user_id: string
  event_type: AttendanceEventType
  lat: number | string | null
  lng: number | string | null
  photo_path: string | null
  validation_status: 'VALID' | 'INVALID'
  validation_reason: string | null
  work_area_snapshot: {
    workAreaId: string
    workLocationId: string
    areaNodes: LatLngNode[]
  } | null
  is_manual: boolean
  manual_reason: string | null
  captured_at: string
  created_at: string
}

type AttendanceProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  employee_code: string | null
}

type AttendanceDayRow = {
  id: string
  user_id: string
  work_date: string
  check_in_event_id: string | null
  check_out_event_id: string | null
  review_status: 'PENDING' | 'APPROVED' | 'REJECTED'
  review_note: string | null
  created_at: string
  user?: AttendanceProfileRow | AttendanceProfileRow[] | null
  profiles?: AttendanceProfileRow | AttendanceProfileRow[] | null
}

type WorkLocationRow = {
  id: string
  name: string
}

const attendanceDaySelect =
  'id,user_id,work_date,check_in_event_id,check_out_event_id,review_status,review_note,created_at,user:profiles!attendance_days_user_id_fkey(id,email,full_name,employee_code)'

function extensionFromContentType(contentType: string) {
  if (contentType === 'image/png') {
    return 'png'
  }

  if (contentType === 'image/webp') {
    return 'webp'
  }

  return 'jpg'
}

function mapEvent(row: AttendanceEventRow, photoUrl: string | null) {
  return {
    id: row.id,
    type: row.event_type,
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    photoPath: row.photo_path,
    photoUrl,
    validationStatus: row.validation_status,
    validationReason: row.validation_reason,
    workAreaSnapshot: row.work_area_snapshot,
    isManual: row.is_manual,
    manualReason: row.manual_reason,
    capturedAt: row.captured_at,
    createdAt: row.created_at
  }
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function mapAttendanceUser(day: AttendanceDayRow) {
  const profile = first(day.user ?? day.profiles)

  if (!profile) {
    return null
  }

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    employeeCode: profile.employee_code
  }
}

async function createSignedReadUrl(path?: string | null) {
  if (!path) {
    return null
  }

  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin.storage
    .from(env.ATTENDANCE_PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 10)

  if (error) {
    return null
  }

  return data.signedUrl
}

async function assertUploadedPhotoExists(upload: PhotoUploadRow) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data: exists, error } = await supabaseAdmin.storage
    .from(upload.storage_bucket)
    .exists(upload.storage_path)

  if (error || !exists) {
    throw badRequest('Attendance photo was not uploaded')
  }
}

async function mapAttendanceDay(
  day: AttendanceDayRow,
  events: AttendanceEventRow[] = [],
  workLocationsById: Map<string, WorkLocationRow> = new Map()
) {
  // A day may contain multiple alternating CHECK_IN/CHECK_OUT cycles. Expose the
  // full ordered list, and keep `checkIn`/`checkOut` as the day's first check-in
  // and last check-out for backoffice daily-summary continuity.
  const ordered = [...events].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
  )
  const mapped = await Promise.all(
    ordered.map(async (event) => mapEvent(event, await createSignedReadUrl(event.photo_path)))
  )
  const checkIns = mapped.filter((event) => event.type === 'CHECK_IN')
  const checkOuts = mapped.filter((event) => event.type === 'CHECK_OUT')
  const workLocations = Array.from(
    new Set(
      events
        .map((event) => event.work_area_snapshot?.workLocationId)
        .filter((locationId): locationId is string => Boolean(locationId))
    )
  )
    .map((locationId) => workLocationsById.get(locationId))
    .filter((location): location is WorkLocationRow => Boolean(location))

  return {
    id: day.id,
    userId: day.user_id,
    user: mapAttendanceUser(day),
    workDate: day.work_date,
    reviewStatus: day.review_status,
    reviewNote: day.review_note,
    workLocations,
    checkIn: checkIns[0] ?? null,
    checkOut: checkOuts[checkOuts.length - 1] ?? null,
    events: mapped,
    createdAt: day.created_at
  }
}

async function getWorkLocationsById(events: AttendanceEventRow[]) {
  const locationIds = Array.from(
    new Set(
      events
        .map((event) => event.work_area_snapshot?.workLocationId)
        .filter((locationId): locationId is string => Boolean(locationId))
    )
  )

  if (locationIds.length === 0) {
    return new Map<string, WorkLocationRow>()
  }

  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('work_locations')
    .select('id,name')
    .in('id', locationIds)

  if (error) {
    throw badRequest(error.message)
  }

  return new Map((data ?? []).map((location) => [location.id, location as WorkLocationRow]))
}

async function getAttendanceDayForDate(userId: string, workDate: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('attendance_days')
    .select('id,user_id,work_date,check_in_event_id,check_out_event_id,review_status,review_note,created_at')
    .eq('user_id', userId)
    .eq('work_date', workDate)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  return data as AttendanceDayRow | null
}

async function assertAttendanceActionAllowed(userId: string, eventType: AttendanceEventType) {
  const workDate = getBangkokDate()
  const day = await getAttendanceDayForDate(userId, workDate)

  // Multiple check-in/check-out cycles per day are allowed; they must alternate.
  // The next action is decided by the most recent event of the day.
  const lastType = day ? await getLastEventType(day.id) : null

  if (eventType === 'CHECK_IN') {
    if (lastType === 'CHECK_IN') {
      throw badRequest('You are already checked in')
    }
  } else if (lastType !== 'CHECK_IN') {
    throw badRequest('Check-in is required before check-out')
  }
}

async function getLastEventType(
  attendanceDayId: string
): Promise<AttendanceEventType | null> {
  const events = await getAttendanceEventsForDay(attendanceDayId)
  if (events.length === 0) {
    return null
  }
  const latest = events.reduce((acc, event) =>
    new Date(event.captured_at).getTime() > new Date(acc.captured_at).getTime() ? event : acc
  )
  return latest.event_type
}

async function getPendingUpload(userId: string, pendingUploadId: string, eventType: AttendanceEventType) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('attendance_photo_uploads')
    .select('id,user_id,event_type,storage_bucket,storage_path,content_type,status,expires_at,upload_expires_at')
    .eq('id', pendingUploadId)
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Pending attendance upload was not found')
  }

  const upload = data as PhotoUploadRow

  if (upload.status !== 'PENDING') {
    throw badRequest('Attendance upload was already used')
  }

  if (new Date(upload.upload_expires_at).getTime() < Date.now()) {
    throw badRequest('Attendance upload expired')
  }

  return upload
}

export async function createAttendanceUploadUrl(input: {
  userId: string
  payload: CreateAttendanceUploadUrlRequest
}) {
  await assertAttendanceActionAllowed(input.userId, input.payload.type)

  const supabaseAdmin = requireSupabaseAdmin()
  const pendingUploadId = randomUUID()
  const workDate = getBangkokDate()
  const extension = extensionFromContentType(input.payload.contentType)
  const storagePath = `attendance/${input.userId}/${workDate}/${pendingUploadId}.${extension}`
  const uploadExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  const retentionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: signedUpload, error: signedUploadError } = await supabaseAdmin.storage
    .from(env.ATTENDANCE_PHOTO_BUCKET)
    .createSignedUploadUrl(storagePath)

  if (signedUploadError || !signedUpload) {
    throw badRequest(signedUploadError?.message ?? 'Unable to create signed upload URL')
  }

  const { error } = await supabaseAdmin.from('attendance_photo_uploads').insert({
    id: pendingUploadId,
    user_id: input.userId,
    event_type: input.payload.type,
    storage_bucket: env.ATTENDANCE_PHOTO_BUCKET,
    storage_path: storagePath,
    content_type: input.payload.contentType,
    expires_at: retentionExpiresAt,
    upload_expires_at: uploadExpiresAt
  })

  if (error) {
    throw badRequest(error.message)
  }

  return {
    pendingUploadId,
    storagePath,
    signedUploadUrl: signedUpload.signedUrl,
    token: signedUpload.token,
    expiresAt: uploadExpiresAt
  }
}

export async function confirmAttendance(input: {
  userId: string
  eventType: AttendanceEventType
  payload: ConfirmAttendanceRequest
  c?: Context<AppEnv> | undefined
}) {
  await assertAttendanceActionAllowed(input.userId, input.eventType)

  const supabaseAdmin = requireSupabaseAdmin()

  // Photo is optional: only validate the upload when the client sent one.
  let upload: PhotoUploadRow | null = null
  if (input.payload.pendingUploadId) {
    upload = await getPendingUpload(input.userId, input.payload.pendingUploadId, input.eventType)
    await assertUploadedPhotoExists(upload)
  }

  const isManual = Boolean(input.payload.isManual)

  if (isManual) {
    if (!input.payload.manualReason?.trim()) {
      throw badRequest('manualReason is required for manual attendance')
    }
  } else if (input.payload.lat === undefined || input.payload.lng === undefined) {
    throw badRequest('lat and lng are required')
  }

  const hasPoint = input.payload.lat !== undefined && input.payload.lng !== undefined
  const point = hasPoint ? { lat: input.payload.lat as number, lng: input.payload.lng as number } : null
  // Manual punches skip geofence enforcement, but still resolve a work area
  // best-effort when a fix was sent, so the snapshot stays populated when
  // possible. Non-manual punches keep the hard rejection unchanged.
  const workArea = point ? await findActiveWorkAreaForPoint(input.userId, point) : null

  if (!isManual && !workArea) {
    await writeEventLog({
      actorUserId: input.userId,
      eventType: 'attendance.location_rejected',
      severity: 'WARN',
      resourceType: 'employee_work_area',
      metadata: {
        attendanceEventType: input.eventType,
        point
      },
      c: input.c
    })

    throw forbidden('Location is outside assigned work area')
  }

  const workDate = getBangkokDate()
  const day =
    (await getAttendanceDayForDate(input.userId, workDate)) ??
    ((
      await supabaseAdmin
        .from('attendance_days')
        .insert({
          user_id: input.userId,
          work_date: workDate
        })
        .select('id,user_id,work_date,check_in_event_id,check_out_event_id,review_status,review_note,created_at')
        .single()
    ).data as AttendanceDayRow | null)

  if (!day) {
    throw badRequest('Unable to create attendance day')
  }

  const eventInsert = await supabaseAdmin
    .from('attendance_events')
    .insert({
      attendance_day_id: day.id,
      user_id: input.userId,
      event_type: input.eventType,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      // Omit photo columns entirely when no photo was uploaded, so photo_path
      // stays null and photo_bucket keeps its column default.
      ...(upload
        ? {
            photo_upload_id: upload.id,
            photo_bucket: env.ATTENDANCE_PHOTO_BUCKET,
            photo_path: upload.storage_path
          }
        : {}),
      validation_status: 'VALID',
      validation_reason: null,
      work_area_snapshot: workArea
        ? {
            workAreaId: workArea.id,
            workLocationId: workArea.work_location_id,
            areaNodes: workArea.area_nodes
          }
        : null,
      is_manual: isManual,
      manual_reason: isManual ? (input.payload.manualReason as string).trim() : null,
      captured_at: input.payload.capturedAt ?? new Date().toISOString()
    })
    .select('id,attendance_day_id,user_id,event_type,lat,lng,photo_path,validation_status,validation_reason,work_area_snapshot,is_manual,manual_reason,captured_at,created_at')
    .single()

  if (eventInsert.error || !eventInsert.data) {
    throw badRequest(eventInsert.error?.message ?? 'Unable to create attendance event')
  }

  const event = eventInsert.data as AttendanceEventRow
  // Keep the day's `check_in_event_id` pinned to the FIRST check-in and advance
  // `check_out_event_id` to the latest check-out, so multiple cycles per day work
  // while the daily summary stays first-in / last-out.
  const dayUpdate: Record<string, string> =
    input.eventType === 'CHECK_IN'
      ? day.check_in_event_id
        ? {}
        : { check_in_event_id: event.id }
      : { check_out_event_id: event.id }

  let updatedDay: AttendanceDayRow = day
  if (Object.keys(dayUpdate).length > 0) {
    const { data, error: updateError } = await supabaseAdmin
      .from('attendance_days')
      .update(dayUpdate)
      .eq('id', day.id)
      .select('id,user_id,work_date,check_in_event_id,check_out_event_id,review_status,review_note,created_at')
      .single()

    if (updateError || !data) {
      throw badRequest(updateError?.message ?? 'Unable to update attendance day')
    }
    updatedDay = data as AttendanceDayRow
  }

  if (upload) {
    await supabaseAdmin
      .from('attendance_photo_uploads')
      .update({ status: 'COMPLETED' })
      .eq('id', upload.id)
  }

  await writeEventLog({
    actorUserId: input.userId,
    eventType: input.eventType === 'CHECK_IN' ? 'attendance.check_in_created' : 'attendance.check_out_created',
    resourceType: 'attendance_event',
    resourceId: event.id,
    metadata: { workDate, point, isManual, manualReason: isManual ? input.payload.manualReason : null },
    c: input.c
  })

  const events = await getAttendanceEventsForDay(day.id)
  return {
    attendanceDay: await mapAttendanceDay(
      updatedDay as AttendanceDayRow,
      events,
      await getWorkLocationsById(events)
    )
  }
}

async function getAttendanceEventsForDay(attendanceDayId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('attendance_events')
    .select('id,attendance_day_id,user_id,event_type,lat,lng,photo_path,validation_status,validation_reason,work_area_snapshot,is_manual,manual_reason,captured_at,created_at')
    .eq('attendance_day_id', attendanceDayId)

  if (error) {
    throw badRequest(error.message)
  }

  return (data ?? []) as AttendanceEventRow[]
}

export async function listAttendance(query: ListAttendanceQuery) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data: pageData, error: pageError } = await supabaseAdmin.rpc(
    'list_attendance_day_page',
    {
      p_page: query.page,
      p_per_page: query.perPage,
      p_user_id: query.userId ?? null,
      p_date_from: query.dateFrom ?? null,
      p_date_to: query.dateTo ?? null,
      p_review_status: query.reviewStatus ?? null,
      p_work_location_id: query.workLocationId ?? null,
      p_sort_by: query.sortBy,
      p_sort_direction: query.sortDirection
    }
  )

  if (pageError) {
    throw badRequest(pageError.message)
  }

  const pageRows = (pageData ?? []) as Array<{
    attendance_day_id: string
    total_count: number | string
  }>
  const attendanceDayIds = pageRows.map((row) => row.attendance_day_id)

  if (attendanceDayIds.length === 0) {
    return {
      attendanceDays: [],
      page: query.page,
      perPage: query.perPage,
      total: 0
    }
  }

  const { data, error } = await supabaseAdmin
    .from('attendance_days')
    .select(attendanceDaySelect)
    .in('id', attendanceDayIds)

  if (error) {
    throw badRequest(error.message)
  }

  const daysById = new Map(
    ((data ?? []) as AttendanceDayRow[]).map((day) => [day.id, day])
  )
  const days = attendanceDayIds.flatMap((attendanceDayId) => {
    const day = daysById.get(attendanceDayId)
    return day ? [day] : []
  })
  const eventsByDay = new Map<string, AttendanceEventRow[]>()

  if (days.length > 0) {
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('attendance_events')
      .select('id,attendance_day_id,user_id,event_type,lat,lng,photo_path,validation_status,validation_reason,work_area_snapshot,is_manual,manual_reason,captured_at,created_at')
      .in(
        'attendance_day_id',
        days.map((day) => day.id)
      )

    if (eventsError) {
      throw badRequest(eventsError.message)
    }

    for (const event of (events ?? []) as AttendanceEventRow[]) {
      const existing = eventsByDay.get(event.attendance_day_id) ?? []
      existing.push(event)
      eventsByDay.set(event.attendance_day_id, existing)
    }
  }

  const workLocationsById = await getWorkLocationsById(
    Array.from(eventsByDay.values()).flat()
  )

  return {
    attendanceDays: await Promise.all(
      days.map((day) =>
        mapAttendanceDay(
          day,
          eventsByDay.get(day.id) ?? [],
          workLocationsById
        )
      )
    ),
    page: query.page,
    perPage: query.perPage,
    total: Number(pageRows[0]?.total_count ?? 0)
  }
}

export async function getAttendanceDay(attendanceDayId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('attendance_days')
    .select(attendanceDaySelect)
    .eq('id', attendanceDayId)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Attendance day was not found')
  }

  const events = await getAttendanceEventsForDay(attendanceDayId)
  return {
    attendanceDay: await mapAttendanceDay(
      data as AttendanceDayRow,
      events,
      await getWorkLocationsById(events)
    )
  }
}

export async function reviewAttendance(input: {
  attendanceDayId: string
  payload: ReviewAttendanceRequest
  reviewerId: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('attendance_days')
    .update({
      review_status: input.payload.reviewStatus,
      review_note: input.payload.reviewNote ?? null,
      reviewed_by: input.reviewerId,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', input.attendanceDayId)
    .select(attendanceDaySelect)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Attendance day was not found')
  }

  await writeAuditLog({
    actorUserId: input.reviewerId,
    action: 'attendance.review',
    resourceType: 'attendance_day',
    resourceId: input.attendanceDayId,
    metadata: {
      reviewStatus: input.payload.reviewStatus,
      reviewNote: input.payload.reviewNote ?? null
    },
    c: input.c
  })

  const events = await getAttendanceEventsForDay(input.attendanceDayId)
  return {
    attendanceDay: await mapAttendanceDay(
      data as AttendanceDayRow,
      events,
      await getWorkLocationsById(events)
    )
  }
}
