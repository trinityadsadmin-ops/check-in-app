import { badRequest } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'

type PhotoUploadRow = {
  id: string
  storage_bucket: string
  storage_path: string
}

async function removePhotoObjects(rows: PhotoUploadRow[]) {
  const supabaseAdmin = requireSupabaseAdmin()
  const pathsByBucket = new Map<string, Set<string>>()

  for (const row of rows) {
    const paths = pathsByBucket.get(row.storage_bucket) ?? new Set<string>()
    paths.add(row.storage_path)
    pathsByBucket.set(row.storage_bucket, paths)
  }

  let deletedPhotoObjects = 0
  for (const [bucket, paths] of pathsByBucket) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).remove([...paths])

    if (error) {
      throw badRequest(error.message)
    }

    deletedPhotoObjects += data?.length ?? 0
  }

  return deletedPhotoObjects
}

export async function cleanupAttendanceRetention() {
  const supabaseAdmin = requireSupabaseAdmin()
  const now = new Date().toISOString()
  const { data: expiredUploads, error: uploadsError } = await supabaseAdmin
    .from('attendance_photo_uploads')
    .select('id,storage_bucket,storage_path')
    .lt('expires_at', now)

  if (uploadsError) {
    throw badRequest(uploadsError.message)
  }

  const deletedPhotoObjects = await removePhotoObjects(
    (expiredUploads ?? []) as PhotoUploadRow[]
  )

  const { count: expiredAttendanceEvents, error: eventsError } = await supabaseAdmin
    .from('attendance_events')
    .delete({ count: 'exact' })
    .lt('expires_at', now)

  if (eventsError) {
    throw badRequest(eventsError.message)
  }

  const { count: expiredAttendanceDays, error: daysError } = await supabaseAdmin
    .from('attendance_days')
    .delete({ count: 'exact' })
    .lt('expires_at', now)

  if (daysError) {
    throw badRequest(daysError.message)
  }

  const { count: expiredPhotoUploads, error: photoUploadsError } = await supabaseAdmin
    .from('attendance_photo_uploads')
    .delete({ count: 'exact' })
    .lt('expires_at', now)

  if (photoUploadsError) {
    throw badRequest(photoUploadsError.message)
  }

  const { data: expiredAreaInspections, error: areaInspectionsError } = await supabaseAdmin
    .from('area_inspections')
    .select('id,photo_bucket,photo_path')
    .lt('expires_at', now)

  if (areaInspectionsError) {
    throw badRequest(areaInspectionsError.message)
  }

  const { data: expiredAreaInspectionUploadRows, error: expiredAreaUploadsError } = await supabaseAdmin
    .from('area_inspection_uploads')
    .select('id,storage_bucket,storage_path')
    .lt('expires_at', now)

  if (expiredAreaUploadsError) {
    throw badRequest(expiredAreaUploadsError.message)
  }

  const deletedAreaInspectionPhotoObjects = await removePhotoObjects(
    [
      ...(expiredAreaInspections ?? []).map((inspection) => ({
        id: inspection.id,
        storage_bucket: inspection.photo_bucket,
        storage_path: inspection.photo_path
      })),
      ...(expiredAreaInspectionUploadRows ?? [])
    ] as PhotoUploadRow[]
  )

  const { count: expiredAreaInspectionCount, error: deleteAreaInspectionsError } = await supabaseAdmin
    .from('area_inspections')
    .delete({ count: 'exact' })
    .lt('expires_at', now)

  if (deleteAreaInspectionsError) {
    throw badRequest(deleteAreaInspectionsError.message)
  }

  const { count: expiredAreaInspectionUploadCount, error: areaUploadsError } = await supabaseAdmin
    .from('area_inspection_uploads')
    .delete({ count: 'exact' })
    .lt('expires_at', now)

  if (areaUploadsError) {
    throw badRequest(areaUploadsError.message)
  }

  return {
    deletedPhotoObjects,
    expiredPhotoUploads: expiredPhotoUploads ?? 0,
    expiredAttendanceEvents: expiredAttendanceEvents ?? 0,
    expiredAttendanceDays: expiredAttendanceDays ?? 0,
    deletedAreaInspectionPhotoObjects,
    expiredAreaInspectionUploads: expiredAreaInspectionUploadCount ?? 0,
    expiredAreaInspections: expiredAreaInspectionCount ?? 0
  }
}
