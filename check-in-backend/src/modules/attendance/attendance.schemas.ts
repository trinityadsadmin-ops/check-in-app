import { z } from '@hono/zod-openapi'
import { LatLngNodeSchema } from '../backoffice/backoffice.schemas.js'

export const AttendanceEventTypeSchema = z.enum(['CHECK_IN', 'CHECK_OUT'])
export const AttendanceReviewStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED'])

export const CreateAttendanceUploadUrlRequestSchema = z
  .object({
    type: AttendanceEventTypeSchema,
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp'])
  })
  .openapi('CreateAttendanceUploadUrlRequest')

export const CreateAttendanceUploadUrlResponseSchema = z
  .object({
    pendingUploadId: z.string().uuid(),
    storagePath: z.string(),
    signedUploadUrl: z.string().url(),
    token: z.string().optional(),
    expiresAt: z.string().datetime()
  })
  .openapi('CreateAttendanceUploadUrlResponse')

export const ConfirmAttendanceRequestSchema = z
  .object({
    /** Optional — attendance can be confirmed without a photo. */
    pendingUploadId: z.string().uuid().optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    capturedAt: z.string().datetime().optional()
  })
  .openapi('ConfirmAttendanceRequest')

export const AttendanceEventSchema = z
  .object({
    id: z.string().uuid(),
    type: AttendanceEventTypeSchema,
    lat: z.number(),
    lng: z.number(),
    photoPath: z.string().nullable(),
    photoUrl: z.string().url().nullable(),
    validationStatus: z.enum(['VALID', 'INVALID']),
    validationReason: z.string().nullable(),
    workAreaSnapshot: z.object({
      workAreaId: z.string().uuid(),
      workLocationId: z.string().uuid(),
      areaNodes: z.array(LatLngNodeSchema).length(4)
    }),
    capturedAt: z.string().datetime(),
    createdAt: z.string().datetime()
  })
  .openapi('AttendanceEvent')

export const AttendanceDaySchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    user: z
      .object({
        id: z.string().uuid(),
        email: z.string().email().nullable(),
        fullName: z.string().nullable(),
        employeeCode: z.string().nullable()
      })
      .nullable(),
    workDate: z.string(),
    reviewStatus: AttendanceReviewStatusSchema,
    reviewNote: z.string().nullable(),
    checkIn: AttendanceEventSchema.nullable(),
    checkOut: AttendanceEventSchema.nullable(),
    /** All check-in/check-out events for the day, oldest first. A day may
     *  contain multiple alternating CHECK_IN/CHECK_OUT cycles. */
    events: z.array(AttendanceEventSchema),
    createdAt: z.string().datetime()
  })
  .openapi('AttendanceDay')

export const ConfirmAttendanceResponseSchema = z
  .object({
    attendanceDay: AttendanceDaySchema
  })
  .openapi('ConfirmAttendanceResponse')

export const ListAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  reviewStatus: AttendanceReviewStatusSchema.optional()
})

export const AttendanceDayIdParamSchema = z.object({
  attendanceDayId: z.string().uuid()
})

export const ListAttendanceResponseSchema = z
  .object({
    attendanceDays: z.array(AttendanceDaySchema),
    page: z.number(),
    perPage: z.number(),
    total: z.number()
  })
  .openapi('ListAttendanceResponse')

export const AttendanceDayResponseSchema = z
  .object({
    attendanceDay: AttendanceDaySchema
  })
  .openapi('AttendanceDayResponse')

export const ReviewAttendanceRequestSchema = z
  .object({
    reviewStatus: AttendanceReviewStatusSchema,
    reviewNote: z.string().max(1000).optional()
  })
  .openapi('ReviewAttendanceRequest')

export type CreateAttendanceUploadUrlRequest = z.infer<
  typeof CreateAttendanceUploadUrlRequestSchema
>
export type ConfirmAttendanceRequest = z.infer<typeof ConfirmAttendanceRequestSchema>
export type ListAttendanceQuery = z.infer<typeof ListAttendanceQuerySchema>
export type ReviewAttendanceRequest = z.infer<typeof ReviewAttendanceRequestSchema>
export type AttendanceEventType = z.infer<typeof AttendanceEventTypeSchema>
