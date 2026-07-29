import { z } from '@hono/zod-openapi'

export const EmergencyStatusSchema = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED'])

export const CreateEmergencyRequestSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    emergencyType: z.string().max(100).optional(),
    message: z.string().max(1000).optional(),
    triggeredAt: z.string().datetime().optional()
  })
  .openapi('CreateEmergencyRequest')

export const EmergencyLogSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    workLocationId: z.string().uuid().nullable(),
    lat: z.number(),
    lng: z.number(),
    emergencyType: z.string().nullable(),
    message: z.string().nullable(),
    status: EmergencyStatusSchema,
    triggeredAt: z.string().datetime(),
    acknowledgedAt: z.string().datetime().nullable(),
    resolvedAt: z.string().datetime().nullable(),
    handledBy: z.string().uuid().nullable(),
    createdAt: z.string().datetime()
  })
  .openapi('EmergencyLog')

/** An OPEN alert on the caller's site, with the triggering employee attached. */
export const ActiveEmergencySchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    workLocationId: z.string().uuid().nullable(),
    lat: z.number(),
    lng: z.number(),
    emergencyType: z.string().nullable(),
    message: z.string().nullable(),
    status: EmergencyStatusSchema,
    triggeredAt: z.string().datetime(),
    user: z
      .object({
        id: z.string().uuid(),
        fullName: z.string().nullable(),
        employeeCode: z.string().nullable()
      })
      .nullable()
  })
  .openapi('ActiveEmergency')

export const ListActiveEmergenciesResponseSchema = z
  .object({
    emergencies: z.array(ActiveEmergencySchema)
  })
  .openapi('ListActiveEmergenciesResponse')

export const CreateEmergencyResponseSchema = z
  .object({
    emergencyLog: EmergencyLogSchema
  })
  .openapi('CreateEmergencyResponse')

/** Backoffice list view: the same log record with the reporting employee attached. */
export const EmergencyLogWithUserSchema = EmergencyLogSchema.extend({
  user: z
    .object({
      id: z.string().uuid(),
      fullName: z.string().nullable(),
      employeeCode: z.string().nullable()
    })
    .nullable()
}).openapi('EmergencyLogWithUser')

export const ListEmergencyLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  status: EmergencyStatusSchema.optional(),
  userId: z.string().uuid().optional()
})

export const EmergencyLogIdParamSchema = z.object({
  emergencyLogId: z.string().uuid()
})

export const ListEmergencyLogsResponseSchema = z
  .object({
    emergencyLogs: z.array(EmergencyLogWithUserSchema),
    page: z.number(),
    perPage: z.number(),
    total: z.number()
  })
  .openapi('ListEmergencyLogsResponse')

export const EmergencyLogResponseSchema = z
  .object({
    emergencyLog: EmergencyLogSchema
  })
  .openapi('EmergencyLogResponse')

export const UpdateEmergencyLogRequestSchema = z
  .object({
    status: EmergencyStatusSchema,
    note: z.string().max(1000).optional()
  })
  .openapi('UpdateEmergencyLogRequest')

export type CreateEmergencyRequest = z.infer<typeof CreateEmergencyRequestSchema>
export type ListEmergencyLogsQuery = z.infer<typeof ListEmergencyLogsQuerySchema>
export type UpdateEmergencyLogRequest = z.infer<typeof UpdateEmergencyLogRequestSchema>
