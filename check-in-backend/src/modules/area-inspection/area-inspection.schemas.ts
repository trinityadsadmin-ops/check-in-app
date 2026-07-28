import { z } from '@hono/zod-openapi'

export const AreaInspectionContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp'
])

export const AreaInspectionReviewStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED'])

export const CreateAreaInspectionUploadUrlRequestSchema = z
  .object({
    contentType: AreaInspectionContentTypeSchema
  })
  .openapi('CreateAreaInspectionUploadUrlRequest')

export const CreateAreaInspectionUploadUrlResponseSchema = z
  .object({
    pendingUploadId: z.string().uuid(),
    storagePath: z.string(),
    signedUploadUrl: z.string().url(),
    token: z.string().optional(),
    expiresAt: z.string().datetime()
  })
  .openapi('CreateAreaInspectionUploadUrlResponse')

export const CreateAreaInspectionRequestSchema = z
  .object({
    pendingUploadId: z.string().uuid(),
    // GPS is recorded for reference only — area inspections are not geofenced,
    // so coordinates may be absent when the device denies location access.
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    capturedAt: z.string().datetime().optional()
  })
  .openapi('CreateAreaInspectionRequest')

export const AreaInspectionSchema = z
  .object({
    id: z.string().uuid(),
    user: z
      .object({
        id: z.string().uuid(),
        email: z.string().email().nullable(),
        fullName: z.string().nullable(),
        employeeCode: z.string().nullable()
      })
      .nullable(),
    workLocationId: z.string().uuid().nullable(),
    workLocationName: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    notes: z.string().nullable(),
    photoPath: z.string(),
    photoUrl: z.string().url().nullable(),
    capturedAt: z.string().datetime(),
    reviewStatus: AreaInspectionReviewStatusSchema,
    reviewNote: z.string().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    reviewedBy: z.string().uuid().nullable(),
    createdAt: z.string().datetime()
  })
  .openapi('AreaInspection')

export const AreaInspectionResponseSchema = z
  .object({
    areaInspection: AreaInspectionSchema
  })
  .openapi('AreaInspectionResponse')

export const ListAreaInspectionsResponseSchema = z
  .object({
    areaInspections: z.array(AreaInspectionSchema),
    page: z.number(),
    perPage: z.number(),
    total: z.number()
  })
  .openapi('ListAreaInspectionsResponse')

/** Admin (backoffice) query — filter across all sites. */
export const ListAreaInspectionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
  workLocationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional()
})

/** Staff (frontend) query — always scoped to the caller's own site. */
export const ListSiteAreaInspectionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional()
})

export const AreaInspectionIdParamSchema = z.object({
  areaInspectionId: z.string().uuid()
})

export const DeleteAreaInspectionResponseSchema = z
  .object({
    id: z.string().uuid(),
    deleted: z.literal(true)
  })
  .openapi('DeleteAreaInspectionResponse')

export const ReviewAreaInspectionRequestSchema = z
  .object({
    reviewStatus: z.enum(['APPROVED', 'REJECTED']),
    reviewNote: z.string().max(1000).optional()
  })
  .openapi('ReviewAreaInspectionRequest')

export type CreateAreaInspectionUploadUrlRequest = z.infer<
  typeof CreateAreaInspectionUploadUrlRequestSchema
>
export type CreateAreaInspectionRequest = z.infer<typeof CreateAreaInspectionRequestSchema>
export type ListAreaInspectionsQuery = z.infer<typeof ListAreaInspectionsQuerySchema>
export type ListSiteAreaInspectionsQuery = z.infer<
  typeof ListSiteAreaInspectionsQuerySchema
>
export type ReviewAreaInspectionRequest = z.infer<typeof ReviewAreaInspectionRequestSchema>
