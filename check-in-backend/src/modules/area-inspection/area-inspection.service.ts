import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'
import {
  areaInspectionReviewNoteRequired,
  badRequest,
  forbidden,
  notFound
} from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { getBangkokDate } from '../attendance/geo.js'
import { writeAuditLog, writeEventLog } from '../logs/logs.service.js'
import type {
  CreateAreaInspectionRequest,
  CreateAreaInspectionUploadUrlRequest,
  ListAreaInspectionsQuery,
  ListSiteAreaInspectionsQuery,
  ReviewAreaInspectionRequest
} from './area-inspection.schemas.js'
import type { Context } from 'hono'
import type { AppEnv } from '../../types/hono.js'

/** Staff may delete their own area inspection within this window after capture. */
const DELETE_WINDOW_MS = 15 * 60 * 1000

type UploadRow = {
  id: string
  user_id: string
  storage_bucket: string
  storage_path: string
  content_type: string
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED'
  upload_expires_at: string
}

type InspectionProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  employee_code: string | null
}

type InspectionLocationRow = {
  id: string
  name: string | null
}

type AreaInspectionRow = {
  id: string
  user_id: string
  work_location_id: string | null
  lat: number | string | null
  lng: number | string | null
  notes: string | null
  photo_bucket: string
  photo_path: string
  captured_at: string
  review_status: 'PENDING' | 'APPROVED' | 'REJECTED'
  review_note: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  user?: InspectionProfileRow | InspectionProfileRow[] | null
  work_location?: InspectionLocationRow | InspectionLocationRow[] | null
}

const inspectionSelect =
  'id,user_id,work_location_id,lat,lng,notes,photo_bucket,photo_path,captured_at,review_status,review_note,reviewed_at,reviewed_by,created_at,user:profiles!area_inspections_user_id_fkey(id,email,full_name,employee_code),work_location:work_locations!area_inspections_work_location_id_fkey(id,name)'

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function extensionFromContentType(contentType: string) {
  if (contentType === 'image/png') {
    return 'png'
  }

  if (contentType === 'image/webp') {
    return 'webp'
  }

  return 'jpg'
}

async function createSignedReadUrl(bucket: string, path?: string | null) {
  if (!path) {
    return null
  }

  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 10)

  if (error) {
    return null
  }

  return data.signedUrl
}

async function mapInspection(row: AreaInspectionRow) {
  const profile = first(row.user)
  const location = first(row.work_location)

  return {
    id: row.id,
    user: profile
      ? {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          employeeCode: profile.employee_code
        }
      : null,
    workLocationId: row.work_location_id,
    workLocationName: location?.name ?? null,
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    notes: row.notes,
    photoPath: row.photo_path,
    photoUrl: await createSignedReadUrl(row.photo_bucket, row.photo_path),
    capturedAt: row.captured_at,
    reviewStatus: row.review_status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at
  }
}

/** Resolve the caller's active work location (site). Returns null if unassigned. */
async function getActiveWorkLocationId(userId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('employee_work_areas')
    .select('work_location_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  return (data?.work_location_id as string | null | undefined) ?? null
}

async function getPendingUpload(userId: string, pendingUploadId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('area_inspection_uploads')
    .select('id,user_id,storage_bucket,storage_path,content_type,status,upload_expires_at')
    .eq('id', pendingUploadId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Pending area inspection upload was not found')
  }

  const upload = data as UploadRow

  if (upload.status !== 'PENDING') {
    throw badRequest('Area inspection upload was already used')
  }

  if (new Date(upload.upload_expires_at).getTime() < Date.now()) {
    throw badRequest('Area inspection upload expired')
  }

  return upload
}

async function assertUploadedPhotoExists(upload: UploadRow) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data: exists, error } = await supabaseAdmin.storage
    .from(upload.storage_bucket)
    .exists(upload.storage_path)

  if (error || !exists) {
    throw badRequest('Area inspection photo was not uploaded')
  }
}

export async function createAreaInspectionUploadUrl(input: {
  userId: string
  payload: CreateAreaInspectionUploadUrlRequest
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const pendingUploadId = randomUUID()
  const workDate = getBangkokDate()
  const extension = extensionFromContentType(input.payload.contentType)
  const storagePath = `inspections/${input.userId}/${workDate}/${pendingUploadId}.${extension}`
  const uploadExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  const retentionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: signedUpload, error: signedUploadError } = await supabaseAdmin.storage
    .from(env.AREA_INSPECTION_PHOTO_BUCKET)
    .createSignedUploadUrl(storagePath)

  if (signedUploadError || !signedUpload) {
    throw badRequest(signedUploadError?.message ?? 'Unable to create signed upload URL')
  }

  const { error } = await supabaseAdmin.from('area_inspection_uploads').insert({
    id: pendingUploadId,
    user_id: input.userId,
    storage_bucket: env.AREA_INSPECTION_PHOTO_BUCKET,
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

export async function createAreaInspection(input: {
  userId: string
  payload: CreateAreaInspectionRequest
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const upload = await getPendingUpload(input.userId, input.payload.pendingUploadId)
  await assertUploadedPhotoExists(upload)

  const workLocationId = await getActiveWorkLocationId(input.userId)

  const insert = await supabaseAdmin
    .from('area_inspections')
    .insert({
      user_id: input.userId,
      work_location_id: workLocationId,
      lat: input.payload.lat ?? null,
      lng: input.payload.lng ?? null,
      notes: input.payload.notes ?? null,
      photo_upload_id: upload.id,
      photo_bucket: upload.storage_bucket,
      photo_path: upload.storage_path,
      captured_at: input.payload.capturedAt ?? new Date().toISOString()
    })
    .select(inspectionSelect)
    .single()

  if (insert.error || !insert.data) {
    throw badRequest(insert.error?.message ?? 'Unable to create area inspection')
  }

  await supabaseAdmin
    .from('area_inspection_uploads')
    .update({ status: 'COMPLETED' })
    .eq('id', upload.id)

  await writeEventLog({
    actorUserId: input.userId,
    eventType: 'area_inspection.created',
    resourceType: 'area_inspection',
    resourceId: (insert.data as AreaInspectionRow).id,
    metadata: { workLocationId },
    c: input.c
  })

  return { areaInspection: await mapInspection(insert.data as AreaInspectionRow) }
}

export async function listAreaInspections(query: ListAreaInspectionsQuery) {
  const supabaseAdmin = requireSupabaseAdmin()
  const from = (query.page - 1) * query.perPage
  const to = from + query.perPage - 1

  let request = supabaseAdmin
    .from('area_inspections')
    .select(inspectionSelect, { count: 'exact' })
    .order('captured_at', { ascending: false })
    .range(from, to)

  if (query.workLocationId) {
    request = request.eq('work_location_id', query.workLocationId)
  }

  if (query.userId) {
    request = request.eq('user_id', query.userId)
  }

  if (query.dateFrom) {
    request = request.gte('captured_at', `${query.dateFrom}T00:00:00.000Z`)
  }

  if (query.dateTo) {
    request = request.lte('captured_at', `${query.dateTo}T23:59:59.999Z`)
  }

  const { data, error, count } = await request

  if (error) {
    throw badRequest(error.message)
  }

  const rows = (data ?? []) as AreaInspectionRow[]

  return {
    areaInspections: await Promise.all(rows.map((row) => mapInspection(row))),
    page: query.page,
    perPage: query.perPage,
    total: count ?? 0
  }
}

/**
 * Site-scoped list for staff: returns every area inspection captured at the
 * caller's active work location, so everyone on the same site sees them all.
 *
 * When the caller has no active work location, their captures are stored with a
 * null work_location_id (which can never match a site filter), so we fall back
 * to scoping by the caller's own reports — otherwise a report would vanish from
 * the author's own log the moment it is saved, even though it persisted.
 */
export async function listSiteAreaInspections(input: {
  userId: string
  query: ListSiteAreaInspectionsQuery
}) {
  const workLocationId = await getActiveWorkLocationId(input.userId)

  if (!workLocationId) {
    return listAreaInspections({
      page: input.query.page,
      perPage: input.query.perPage,
      userId: input.userId,
      dateFrom: input.query.dateFrom,
      dateTo: input.query.dateTo
    })
  }

  return listAreaInspections({
    page: input.query.page,
    perPage: input.query.perPage,
    workLocationId,
    dateFrom: input.query.dateFrom,
    dateTo: input.query.dateTo
  })
}

async function getInspectionRow(areaInspectionId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('area_inspections')
    .select('id,user_id,photo_bucket,photo_path,captured_at')
    .eq('id', areaInspectionId)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Area inspection was not found')
  }

  return data as Pick<
    AreaInspectionRow,
    'id' | 'user_id' | 'photo_bucket' | 'photo_path' | 'captured_at'
  >
}

async function removeInspection(
  row: Pick<AreaInspectionRow, 'id' | 'photo_bucket' | 'photo_path'>
) {
  const supabaseAdmin = requireSupabaseAdmin()

  // Best-effort removal of the stored photo; the row is the source of truth.
  await supabaseAdmin.storage.from(row.photo_bucket).remove([row.photo_path])

  const { error } = await supabaseAdmin.from('area_inspections').delete().eq('id', row.id)

  if (error) {
    throw badRequest(error.message)
  }
}

/** Staff-side delete: own inspection, within the {@link DELETE_WINDOW_MS} window. */
export async function deleteOwnAreaInspection(input: {
  areaInspectionId: string
  userId: string
  c?: Context<AppEnv> | undefined
}) {
  const row = await getInspectionRow(input.areaInspectionId)

  if (row.user_id !== input.userId) {
    throw forbidden('You can only delete your own area inspection')
  }

  if (Date.now() - new Date(row.captured_at).getTime() > DELETE_WINDOW_MS) {
    throw forbidden('The delete window for this area inspection has passed')
  }

  await removeInspection(row)

  await writeEventLog({
    actorUserId: input.userId,
    eventType: 'area_inspection.deleted',
    resourceType: 'area_inspection',
    resourceId: row.id,
    c: input.c
  })

  return { id: row.id, deleted: true as const }
}

/** Admin-side delete: any inspection, no time window. */
export async function deleteAreaInspection(input: {
  areaInspectionId: string
  actorUserId: string
  c?: Context<AppEnv> | undefined
}) {
  const row = await getInspectionRow(input.areaInspectionId)

  await removeInspection(row)

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'area_inspection.delete',
    resourceType: 'area_inspection',
    resourceId: row.id,
    c: input.c
  })

  return { id: row.id, deleted: true as const }
}

export async function reviewAreaInspection(input: {
  areaInspectionId: string
  payload: ReviewAreaInspectionRequest
  reviewerId: string
  c?: Context<AppEnv> | undefined
}) {
  if (input.payload.reviewStatus === 'REJECTED' && !input.payload.reviewNote?.trim()) {
    throw areaInspectionReviewNoteRequired()
  }

  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('area_inspections')
    .update({
      review_status: input.payload.reviewStatus,
      review_note: input.payload.reviewNote?.trim() || null,
      reviewed_by: input.reviewerId,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', input.areaInspectionId)
    .select(inspectionSelect)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Area inspection was not found')
  }

  await writeAuditLog({
    actorUserId: input.reviewerId,
    action: 'area_inspection.review',
    resourceType: 'area_inspection',
    resourceId: input.areaInspectionId,
    metadata: {
      reviewStatus: input.payload.reviewStatus,
      reviewNote: input.payload.reviewNote?.trim() || null
    },
    c: input.c
  })
  await writeEventLog({
    actorUserId: input.reviewerId,
    eventType: 'area_inspection.reviewed',
    resourceType: 'area_inspection',
    resourceId: input.areaInspectionId,
    metadata: { reviewStatus: input.payload.reviewStatus },
    c: input.c
  })

  return { areaInspection: await mapInspection(data as AreaInspectionRow) }
}
