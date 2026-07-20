import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'
import { badRequest, forbidden, notFound } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { writeAuditLog, writeEventLog } from '../logs/logs.service.js'
import { getBangkokDate, isPointInsidePolygon, type LatLngNode } from './geo.js'
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

type EmployeeWorkAreaRow = {
  id: string
  user_id: string
  work_location_id: string
  area_nodes: LatLngNode[]
  is_active: boolean
}

type AttendanceEventRow = {
  id: string
  attendance_day_id: string
  user_id: string
  event_type: AttendanceEventType
  lat: number | string
  lng: number | string
  photo_path: string | null
  validation_status: 'VALID' | 'INVALID'
  validation_reason: string | null
  work_area_snapshot: {
    workAreaId: string
    workLocationId: string
    areaNodes: LatLngNode[]
  }
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
    lat: Number(row.lat),
    lng: Number(row.lng),
    photoPath: row.photo_path,
    photoUrl,
    validationStatus: row.validation_status,
    validationReason: row.validation_reason,
    workAreaSnapshot: row.work_area_snapshot,
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
  events: AttendanceEventRow[] = []
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

  return {
    id: day.id,
    userId: day.user_id,
    user: mapAttendanceUser(day),
    workDate: day.work_date,
    reviewStatus: day.review_status,
    reviewNote: day.review_note,
    checkIn: checkIns[0] ?? null,
    checkOut: checkOuts[checkOuts.length - 1] ?? null,
    events: mapped,
    createdAt: day.created_at
  }
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

async function getActiveWorkArea(userId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('employee_work_areas')
    .select('id,user_id,work_location_id,area_nodes,is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw forbidden('Active work area is required')
  }

  return data as EmployeeWorkAreaRow
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

  const workArea = await getActiveWorkArea(input.userId)
  const point = { lat: input.payload.lat, lng: input.payload.lng }

  if (!isPointInsidePolygon(point, workArea.area_nodes)) {
    await writeEventLog({
      actorUserId: input.userId,
      eventType: 'attendance.location_rejected',
      severity: 'WARN',
      resourceType: 'employee_work_area',
      resourceId: workArea.id,
      metadata: {
        attendanceEventType: input.eventType,
        point,
        workAreaId: workArea.id
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
      lat: input.payload.lat,
      lng: input.payload.lng,
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
      work_area_snapshot: {
        workAreaId: workArea.id,
        workLocationId: workArea.work_location_id,
        areaNodes: workArea.area_nodes
      },
      captured_at: input.payload.capturedAt ?? new Date().toISOString()
    })
    .select('id,attendance_day_id,user_id,event_type,lat,lng,photo_path,validation_status,validation_reason,work_area_snapshot,captured_at,created_at')
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
    metadata: { workDate, point },
    c: input.c
  })

  const events = await getAttendanceEventsForDay(day.id)
  return { attendanceDay: await mapAttendanceDay(updatedDay as AttendanceDayRow, events) }
}

async function getAttendanceEventsForDay(attendanceDayId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('attendance_events')
    .select('id,attendance_day_id,user_id,event_type,lat,lng,photo_path,validation_status,validation_reason,work_area_snapshot,captured_at,created_at')
    .eq('attendance_day_id', attendanceDayId)

  if (error) {
    throw badRequest(error.message)
  }

  return (data ?? []) as AttendanceEventRow[]
}

export async function listAttendance(query: ListAttendanceQuery) {
  const supabaseAdmin = requireSupabaseAdmin()
  const from = (query.page - 1) * query.perPage
  const to = from + query.perPage - 1

  let request = supabaseAdmin
    .from('attendance_days')
    .select(attendanceDaySelect, { count: 'exact' })
    .order('work_date', { ascending: false })
    .range(from, to)

  if (query.userId) {
    request = request.eq('user_id', query.userId)
  }

  if (query.dateFrom) {
    request = request.gte('work_date', query.dateFrom)
  }

  if (query.dateTo) {
    request = request.lte('work_date', query.dateTo)
  }

  if (query.reviewStatus) {
    request = request.eq('review_status', query.reviewStatus)
  }

  const { data, error, count } = await request

  if (error) {
    throw badRequest(error.message)
  }

  const days = (data ?? []) as AttendanceDayRow[]
  const eventsByDay = new Map<string, AttendanceEventRow[]>()

  if (days.length > 0) {
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('attendance_events')
      .select('id,attendance_day_id,user_id,event_type,lat,lng,photo_path,validation_status,validation_reason,work_area_snapshot,captured_at,created_at')
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

  return {
    attendanceDays: await Promise.all(
      days.map((day) => mapAttendanceDay(day, eventsByDay.get(day.id) ?? []))
    ),
    page: query.page,
    perPage: query.perPage,
    total: count ?? 0
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

  return {
    attendanceDay: await mapAttendanceDay(
      data as AttendanceDayRow,
      await getAttendanceEventsForDay(attendanceDayId)
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

  return {
    attendanceDay: await mapAttendanceDay(
      data as AttendanceDayRow,
      await getAttendanceEventsForDay(input.attendanceDayId)
    )
  }
}
