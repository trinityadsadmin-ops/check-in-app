import { z } from '@hono/zod-openapi'
import { UserSchema } from '../../shared/schemas/common.js'

export const UuidParamSchema = z.object({
  userId: z.string().uuid()
})

export const WorkLocationIdParamSchema = z.object({
  workLocationId: z.string().uuid()
})

export const WorkLocationUserParamSchema = z.object({
  workLocationId: z.string().uuid(),
  userId: z.string().uuid()
})

export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional()
})

export const RoleSchema = z
  .object({
    id: z.string().uuid(),
    key: z.string(),
    name: z.string()
  })
  .openapi('Role')

export const PermissionSchema = z
  .object({
    id: z.string().uuid(),
    key: z.string(),
    name: z.string()
  })
  .openapi('Permission')

export const BackofficeUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email().nullable(),
    fullName: z.string().nullable(),
    employeeCode: z.string().nullable(),
    role: RoleSchema,
    isActive: z.boolean(),
    createdAt: z.string().nullable()
  })
  .openapi('BackofficeUser')

export const CreateBackofficeUserRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(1).max(120).optional(),
    employeeCode: z.string().min(1).max(80).optional(),
    roleId: z.string().uuid(),
    isActive: z.boolean().default(true)
  })
  .openapi('CreateBackofficeUserRequest')

export const UpdateBackofficeUserRequestSchema = z
  .object({
    fullName: z.string().min(1).max(120).nullable().optional(),
    employeeCode: z.string().min(1).max(80).nullable().optional(),
    roleId: z.string().uuid().optional(),
    isActive: z.boolean().optional()
  })
  .openapi('UpdateBackofficeUserRequest')

export const UserPermissionOverrideSchema = z
  .object({
    permissionKey: z.string(),
    effect: z.enum(['ALLOW', 'DENY'])
  })
  .openapi('UserPermissionOverride')

export const SetUserPermissionOverridesRequestSchema = z
  .object({
    overrides: z.array(UserPermissionOverrideSchema).max(100)
  })
  .openapi('SetUserPermissionOverridesRequest')

export const UserPermissionOverridesResponseSchema = z
  .object({
    overrides: z.array(UserPermissionOverrideSchema)
  })
  .openapi('UserPermissionOverridesResponse')

export const EffectivePermissionSchema = z
  .object({
    permission: PermissionSchema,
    granted: z.boolean(),
    roleGranted: z.boolean(),
    overrideEffect: z.enum(['ALLOW', 'DENY']).nullable(),
    source: z.enum(['ROLE', 'USER_ALLOW', 'USER_DENY', 'NONE'])
  })
  .openapi('EffectivePermission')

export const UserEffectivePermissionsResponseSchema = z
  .object({
    user: BackofficeUserSchema,
    permissions: z.array(EffectivePermissionSchema)
  })
  .openapi('UserEffectivePermissionsResponse')

export const BackofficeUserResponseSchema = z
  .object({
    user: BackofficeUserSchema
  })
  .openapi('BackofficeUserResponse')

export const ListUsersResponseSchema = z
  .object({
    users: z.array(BackofficeUserSchema),
    page: z.number(),
    perPage: z.number(),
    total: z.number()
  })
  .openapi('ListUsersResponse')

export const ListRolesResponseSchema = z
  .object({
    roles: z.array(RoleSchema)
  })
  .openapi('ListRolesResponse')

export const ListPermissionsResponseSchema = z
  .object({
    permissions: z.array(PermissionSchema)
  })
  .openapi('ListPermissionsResponse')

export const DeviceBindingSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    deviceUuid: z.string().uuid(),
    isActive: z.boolean(),
    boundAt: z.string().datetime(),
    resetAt: z.string().datetime().nullable()
  })
  .openapi('DeviceBinding')

export const GetUserDeviceResponseSchema = z
  .object({
    device: DeviceBindingSchema.nullable()
  })
  .openapi('GetUserDeviceResponse')

export const ResetDeviceRequestSchema = z
  .object({
    reason: z.string().max(500).optional()
  })
  .openapi('ResetDeviceRequest')

export const ResetDeviceResponseSchema = z
  .object({
    reset: z.boolean()
  })
  .openapi('ResetDeviceResponse')

export const LatLngNodeSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
  })
  .openapi('LatLngNode')

export const WorkLocationSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    areaNodes: z.array(LatLngNodeSchema).length(4),
    isActive: z.boolean(),
    createdAt: z.string().datetime()
  })
  .openapi('WorkLocation')

export const CreateWorkLocationRequestSchema = z
  .object({
    name: z.string().min(1).max(160),
    description: z.string().max(1000).optional(),
    areaNodes: z.array(LatLngNodeSchema).length(4),
    isActive: z.boolean().default(true)
  })
  .openapi('CreateWorkLocationRequest')

export const UpdateWorkLocationRequestSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    description: z.string().max(1000).nullable().optional(),
    areaNodes: z.array(LatLngNodeSchema).length(4).optional(),
    isActive: z.boolean().optional()
  })
  .openapi('UpdateWorkLocationRequest')

export const ListWorkLocationsResponseSchema = z
  .object({
    workLocations: z.array(WorkLocationSchema)
  })
  .openapi('ListWorkLocationsResponse')

export const WorkLocationResponseSchema = z
  .object({
    workLocation: WorkLocationSchema
  })
  .openapi('WorkLocationResponse')

export const WorkLocationUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email().nullable(),
    fullName: z.string().nullable(),
    employeeCode: z.string().nullable(),
    assignedAt: z.string().datetime()
  })
  .openapi('WorkLocationUser')

export const WorkLocationUsersResponseSchema = z
  .object({
    users: z.array(WorkLocationUserSchema)
  })
  .openapi('WorkLocationUsersResponse')

export const UnassignWorkLocationUserResponseSchema = z
  .object({
    unassigned: z.boolean()
  })
  .openapi('UnassignWorkLocationUserResponse')

export const EmployeeWorkAreaSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    workLocationId: z.string().uuid(),
    areaNodes: z.array(LatLngNodeSchema).length(4),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .openapi('EmployeeWorkArea')

export const SetEmployeeWorkAreaRequestSchema = z
  .object({
    workLocationId: z.string().uuid(),
    isActive: z.boolean().default(true),
    allowReassignment: z.boolean().default(false)
  })
  .openapi('SetEmployeeWorkAreaRequest')

export const EmployeeWorkAreaResponseSchema = z
  .object({
    workArea: EmployeeWorkAreaSchema.nullable()
  })
  .openapi('EmployeeWorkAreaResponse')

export const LogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20)
})

export const AuditLogSchema = z
  .object({
    id: z.string().uuid(),
    actorUserId: z.string().uuid().nullable(),
    actor: z
      .object({
        id: z.string().uuid(),
        fullName: z.string().nullable(),
        employeeCode: z.string().nullable()
      })
      .nullable(),
    action: z.string(),
    resourceType: z.string(),
    resourceId: z.string().nullable(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    metadata: z.unknown(),
    createdAt: z.string().datetime()
  })
  .openapi('AuditLog')

export const EventLogSchema = z
  .object({
    id: z.string().uuid(),
    actorUserId: z.string().uuid().nullable(),
    eventType: z.string(),
    severity: z.enum(['INFO', 'WARN', 'ERROR']),
    resourceType: z.string().nullable(),
    resourceId: z.string().nullable(),
    metadata: z.unknown(),
    createdAt: z.string().datetime()
  })
  .openapi('EventLog')

export const ListAuditLogsResponseSchema = z
  .object({
    auditLogs: z.array(AuditLogSchema),
    page: z.number(),
    perPage: z.number(),
    total: z.number()
  })
  .openapi('ListAuditLogsResponse')

export const ListEventLogsResponseSchema = z
  .object({
    eventLogs: z.array(EventLogSchema),
    page: z.number(),
    perPage: z.number(),
    total: z.number()
  })
  .openapi('ListEventLogsResponse')

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>
export type CreateBackofficeUserRequest = z.infer<typeof CreateBackofficeUserRequestSchema>
export type UpdateBackofficeUserRequest = z.infer<typeof UpdateBackofficeUserRequestSchema>
export type SetUserPermissionOverridesRequest = z.infer<
  typeof SetUserPermissionOverridesRequestSchema
>
export type CreateWorkLocationRequest = z.infer<typeof CreateWorkLocationRequestSchema>
export type UpdateWorkLocationRequest = z.infer<typeof UpdateWorkLocationRequestSchema>
export type SetEmployeeWorkAreaRequest = z.infer<typeof SetEmployeeWorkAreaRequestSchema>
export type LogsQuery = z.infer<typeof LogsQuerySchema>
