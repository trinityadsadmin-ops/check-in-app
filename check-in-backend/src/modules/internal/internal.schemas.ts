import { z } from '@hono/zod-openapi'

export const RetentionCleanupResponseSchema = z
  .object({
    deletedPhotoObjects: z.number(),
    expiredPhotoUploads: z.number(),
    expiredAttendanceEvents: z.number(),
    expiredAttendanceDays: z.number(),
    deletedAreaInspectionPhotoObjects: z.number(),
    expiredAreaInspectionUploads: z.number(),
    expiredAreaInspections: z.number()
  })
  .openapi('RetentionCleanupResponse')
