import { z } from '@hono/zod-openapi'

export const ActionLogPhaseSchema = z.enum(['INTENT', 'RESULT'])
export const ActionLogOutcomeSchema = z.enum(['SUCCESS', 'FAILURE'])

export const ClientActionLogSchema = z
  .object({
    actionId: z.string().uuid(),
    action: z.string().min(1).max(100),
    phase: ActionLogPhaseSchema,
    outcome: ActionLogOutcomeSchema.optional(),
    errorCode: z.string().max(100).optional(),
    errorMessage: z.string().max(1000).optional(),
    clientAt: z.string().datetime(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .openapi('ClientActionLog')

export const RecordActionLogsRequestSchema = z
  .object({
    logs: z.array(ClientActionLogSchema).min(1).max(50)
  })
  .openapi('RecordActionLogsRequest')

export const RecordActionLogsResponseSchema = z
  .object({
    recorded: z.number().int()
  })
  .openapi('RecordActionLogsResponse')

export const ListActionLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
  userId: z.string().uuid().optional(),
  actionId: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  outcome: ActionLogOutcomeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'clientAt', 'employee', 'action']).default('createdAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc')
})

export const ActionLogSchema = z
  .object({
    id: z.string().uuid(),
    actionId: z.string().uuid(),
    userId: z.string().uuid().nullable(),
    user: z
      .object({
        id: z.string().uuid(),
        fullName: z.string().nullable(),
        employeeCode: z.string().nullable()
      })
      .nullable(),
    action: z.string(),
    phase: ActionLogPhaseSchema,
    source: z.enum(['CLIENT', 'SERVER']),
    outcome: ActionLogOutcomeSchema.nullable(),
    httpStatus: z.number().int().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    clientAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    deviceUuid: z.string().uuid().nullable(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    metadata: z.unknown()
  })
  .openapi('ActionLog')

export const ListActionLogsResponseSchema = z
  .object({
    actionLogs: z.array(ActionLogSchema),
    page: z.number(),
    perPage: z.number(),
    total: z.number()
  })
  .openapi('ListActionLogsResponse')

export type RecordActionLogsRequest = z.infer<typeof RecordActionLogsRequestSchema>
export type ListActionLogsQuery = z.infer<typeof ListActionLogsQuerySchema>
