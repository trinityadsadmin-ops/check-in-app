import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { forbidden } from '../../core/errors/http-error.js'
import { requireAuth } from '../../middlewares/auth.js'
import { permissions } from '../auth/permissions.js'
import {
  AttendanceDayIdParamSchema,
  AttendanceDayResponseSchema,
  ListAttendanceQuerySchema,
  ListAttendanceResponseSchema,
  ReviewAttendanceRequestSchema
} from '../attendance/attendance.schemas.js'
import {
  getAttendanceDay,
  listAttendance,
  reviewAttendance
} from '../attendance/attendance.service.js'
import {
  AreaInspectionIdParamSchema,
  DeleteAreaInspectionResponseSchema,
  ListAreaInspectionsQuerySchema,
  ListAreaInspectionsResponseSchema,
  AreaInspectionResponseSchema,
  ReviewAreaInspectionRequestSchema
} from '../area-inspection/area-inspection.schemas.js'
import {
  deleteAreaInspection,
  listAreaInspections,
  reviewAreaInspection
} from '../area-inspection/area-inspection.service.js'
import {
  EmergencyLogIdParamSchema,
  EmergencyLogResponseSchema,
  ListEmergencyLogsQuerySchema,
  ListEmergencyLogsResponseSchema,
  UpdateEmergencyLogRequestSchema
} from '../emergency/emergency.schemas.js'
import {
  getEmergencyLog,
  listEmergencyLogs,
  updateEmergencyLog
} from '../emergency/emergency.service.js'
import {
  CreateSalaryUploadUrlRequestSchema,
  CreateSalaryUploadUrlResponseSchema,
  DeleteSalaryRecordResponseSchema,
  DeleteSalaryUploadResponseSchema,
  ImportSalaryRequestSchema,
  ImportSalaryResponseSchema,
  ListSalaryRecordsQuerySchema,
  ListSalaryRecordsResponseSchema,
  ListSalaryUploadsQuerySchema,
  ListSalaryUploadsResponseSchema,
  SalaryRecordIdParamSchema,
  SalaryUploadBatchIdParamSchema
} from '../salary/salary.schemas.js'
import {
  createSalaryUploadUrl,
  deleteSalaryRecord,
  deleteSalaryUpload,
  importSalaryUpload,
  listSalaryRecords,
  listSalaryUploads
} from '../salary/salary.service.js'
import { ErrorResponseSchema } from '../../shared/schemas/common.js'
import type { AppEnv } from '../../types/hono.js'
import {
  BackofficeUserResponseSchema,
  CreateBackofficeUserRequestSchema,
  CreateWorkLocationRequestSchema,
  EmployeeWorkAreasResponseSchema,
  GetUserDeviceResponseSchema,
  ListAuditLogsResponseSchema,
  ListEventLogsResponseSchema,
  ListPermissionsResponseSchema,
  ListRolesResponseSchema,
  ListUsersQuerySchema,
  ListUsersResponseSchema,
  ListWorkLocationsResponseSchema,
  LogsQuerySchema,
  ResetDeviceRequestSchema,
  ResetDeviceResponseSchema,
  SetUserPermissionOverridesRequestSchema,
  SetEmployeeWorkAreaRequestSchema,
  UnassignWorkLocationUserResponseSchema,
  UpdateBackofficeUserRequestSchema,
  UserEffectivePermissionsResponseSchema,
  UserPermissionOverridesResponseSchema,
  UpdateWorkLocationRequestSchema,
  UuidParamSchema,
  WorkLocationIdParamSchema,
  WorkLocationUserParamSchema,
  WorkLocationUsersResponseSchema,
  WorkLocationResponseSchema
} from './backoffice.schemas.js'
import {
  createBackofficeUser,
  createWorkLocation,
  getUserEffectivePermissions,
  getUserPermissionOverrides,
  getUserDevice,
  getUserWorkAreas,
  listAuditLogs,
  listEventLogs,
  listPermissions,
  listRoles,
  listUsers,
  listWorkLocations,
  listWorkLocationUsers,
  resetUserDevice,
  setUserPermissionOverrides,
  setUserWorkArea,
  updateBackofficeUser,
  updateWorkLocation,
  unassignWorkLocationUser
} from './backoffice.service.js'

export const backofficeRoutes = new OpenAPIHono<AppEnv>()

backofficeRoutes.use('*', requireAuth)

function ensurePermission(c: Context<AppEnv>, permission: string) {
  if (!c.get('currentUser').permissions.includes(permission)) {
    throw forbidden(`Missing permission: ${permission}`)
  }
}

function ensurePermissions(c: Context<AppEnv>, requiredPermissions: string[]) {
  for (const permission of requiredPermissions) {
    ensurePermission(c, permission)
  }
}

const commonErrorResponses = {
  401: {
    description: 'Missing or invalid access token',
    content: {
      'application/json': {
        schema: ErrorResponseSchema
      }
    }
  },
  403: {
    description: 'Missing required permission',
    content: {
      'application/json': {
        schema: ErrorResponseSchema
      }
    }
  }
}

const listUsersRoute = createRoute({
  method: 'get',
  path: '/users',
  operationId: 'listBackofficeUsers',
  tags: ['Backoffice'],
  request: {
    query: ListUsersQuerySchema
  },
  responses: {
    200: {
      description: 'Backoffice users list',
      content: {
        'application/json': {
          schema: ListUsersResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listUsersRoute, async (c) => {
  ensurePermission(c, permissions.usersRead)
  const query = c.req.valid('query')
  return c.json(await listUsers(query), 200)
})

const createUserRoute = createRoute({
  method: 'post',
  path: '/users',
  operationId: 'createBackofficeUser',
  tags: ['Backoffice'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateBackofficeUserRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'User created',
      content: {
        'application/json': {
          schema: BackofficeUserResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(createUserRoute, async (c) => {
  ensurePermissions(c, [permissions.usersCreate, permissions.rolesAssign])
  return c.json(
    await createBackofficeUser({
      payload: c.req.valid('json'),
      actorUserId: c.get('currentUser').id,
      c
    }),
    201
  )
})

const updateUserRoute = createRoute({
  method: 'patch',
  path: '/users/{userId}',
  operationId: 'updateBackofficeUser',
  tags: ['Backoffice'],
  request: {
    params: UuidParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: UpdateBackofficeUserRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'User updated',
      content: {
        'application/json': {
          schema: BackofficeUserResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(updateUserRoute, async (c) => {
  const { userId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const requiredPermissions = new Set<string>()

  if (
    payload.fullName !== undefined ||
    payload.email !== undefined ||
    payload.password !== undefined ||
    payload.employeeCode !== undefined ||
    payload.isActive !== undefined
  ) {
    requiredPermissions.add(permissions.usersUpdate)
  }

  if (payload.roleId !== undefined) {
    requiredPermissions.add(permissions.rolesAssign)
  }

  ensurePermissions(c, Array.from(requiredPermissions))

  return c.json(
    await updateBackofficeUser({
      userId,
      payload,
      actorUserId: c.get('currentUser').id,
      c
    }),
    200
  )
})

const listRolesRoute = createRoute({
  method: 'get',
  path: '/roles',
  operationId: 'listRoles',
  tags: ['Backoffice'],
  responses: {
    200: {
      description: 'Roles list',
      content: {
        'application/json': {
          schema: ListRolesResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listRolesRoute, async (c) => {
  ensurePermission(c, permissions.rolesRead)
  return c.json(await listRoles(), 200)
})

const listPermissionsRoute = createRoute({
  method: 'get',
  path: '/permissions',
  operationId: 'listPermissions',
  tags: ['Backoffice'],
  responses: {
    200: {
      description: 'Permissions list',
      content: {
        'application/json': {
          schema: ListPermissionsResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listPermissionsRoute, async (c) => {
  ensurePermission(c, permissions.permissionsRead)
  return c.json(await listPermissions(), 200)
})

const getUserDeviceRoute = createRoute({
  method: 'get',
  path: '/users/{userId}/device',
  operationId: 'getUserDevice',
  tags: ['Backoffice'],
  request: {
    params: UuidParamSchema
  },
  responses: {
    200: {
      description: 'Current active device binding for a user',
      content: {
        'application/json': {
          schema: GetUserDeviceResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(getUserDeviceRoute, async (c) => {
  ensurePermission(c, permissions.usersRead)
  const { userId } = c.req.valid('param')
  return c.json(await getUserDevice(userId), 200)
})

const getUserPermissionOverridesRoute = createRoute({
  method: 'get',
  path: '/users/{userId}/permissions',
  operationId: 'getUserPermissionOverrides',
  tags: ['Backoffice'],
  request: {
    params: UuidParamSchema
  },
  responses: {
    200: {
      description: 'User permission overrides',
      content: {
        'application/json': {
          schema: UserPermissionOverridesResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(getUserPermissionOverridesRoute, async (c) => {
  ensurePermission(c, permissions.permissionsRead)
  const { userId } = c.req.valid('param')
  return c.json(await getUserPermissionOverrides(userId), 200)
})

const getUserEffectivePermissionsRoute = createRoute({
  method: 'get',
  path: '/users/{userId}/effective-permissions',
  operationId: 'getUserEffectivePermissions',
  tags: ['Backoffice'],
  request: {
    params: UuidParamSchema
  },
  responses: {
    200: {
      description: 'User effective permissions',
      content: {
        'application/json': {
          schema: UserEffectivePermissionsResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(getUserEffectivePermissionsRoute, async (c) => {
  ensurePermission(c, permissions.permissionsRead)
  const { userId } = c.req.valid('param')
  return c.json(await getUserEffectivePermissions(userId), 200)
})

const setUserPermissionOverridesRoute = createRoute({
  method: 'put',
  path: '/users/{userId}/permissions',
  operationId: 'setUserPermissionOverrides',
  tags: ['Backoffice'],
  request: {
    params: UuidParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: SetUserPermissionOverridesRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'User permission overrides set',
      content: {
        'application/json': {
          schema: UserPermissionOverridesResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(setUserPermissionOverridesRoute, async (c) => {
  ensurePermission(c, permissions.permissionsUpdate)
  const { userId } = c.req.valid('param')
  return c.json(
    await setUserPermissionOverrides({
      userId,
      payload: c.req.valid('json'),
      actorUserId: c.get('currentUser').id,
      c
    }),
    200
  )
})

const resetUserDeviceRoute = createRoute({
  method: 'post',
  path: '/users/{userId}/device/reset',
  operationId: 'resetUserDevice',
  tags: ['Backoffice'],
  request: {
    params: UuidParamSchema,
    body: {
      required: false,
      content: {
        'application/json': {
          schema: ResetDeviceRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Reset user active device binding',
      content: {
        'application/json': {
          schema: ResetDeviceResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(resetUserDeviceRoute, async (c) => {
  ensurePermission(c, permissions.usersResetDevice)
  const { userId } = c.req.valid('param')
  const body = c.req.valid('json')
  return c.json(
    await resetUserDevice({
      userId,
      resetBy: c.get('currentUser').id,
      reason: body?.reason,
      c
    }),
    200
  )
})

const listWorkLocationsRoute = createRoute({
  method: 'get',
  path: '/work-locations',
  operationId: 'listWorkLocations',
  tags: ['Backoffice'],
  responses: {
    200: {
      description: 'Work locations list',
      content: {
        'application/json': {
          schema: ListWorkLocationsResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listWorkLocationsRoute, async (c) => {
  ensurePermission(c, permissions.workAreasRead)
  return c.json(await listWorkLocations(), 200)
})

const createWorkLocationRoute = createRoute({
  method: 'post',
  path: '/work-locations',
  operationId: 'createWorkLocation',
  tags: ['Backoffice'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateWorkLocationRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Work location created',
      content: {
        'application/json': {
          schema: WorkLocationResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(createWorkLocationRoute, async (c) => {
  ensurePermission(c, permissions.workAreasManage)
  const payload = c.req.valid('json')
  return c.json(
    await createWorkLocation({
      payload,
      actorUserId: c.get('currentUser').id,
      c
    }),
    201
  )
})

const updateWorkLocationRoute = createRoute({
  method: 'patch',
  path: '/work-locations/{workLocationId}',
  operationId: 'updateWorkLocation',
  tags: ['Backoffice'],
  request: {
    params: WorkLocationIdParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: UpdateWorkLocationRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Work location updated',
      content: {
        'application/json': {
          schema: WorkLocationResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(updateWorkLocationRoute, async (c) => {
  ensurePermission(c, permissions.workAreasManage)
  const { workLocationId } = c.req.valid('param')
  const payload = c.req.valid('json')
  return c.json(
    await updateWorkLocation({
      workLocationId,
      payload,
      actorUserId: c.get('currentUser').id,
      c
    }),
    200
  )
})

const listWorkLocationUsersRoute = createRoute({
  method: 'get',
  path: '/work-locations/{workLocationId}/users',
  operationId: 'listWorkLocationUsers',
  tags: ['Backoffice'],
  request: {
    params: WorkLocationIdParamSchema
  },
  responses: {
    200: {
      description: 'Employees assigned to the work location',
      content: {
        'application/json': {
          schema: WorkLocationUsersResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listWorkLocationUsersRoute, async (c) => {
  ensurePermission(c, permissions.workAreasRead)
  const { workLocationId } = c.req.valid('param')
  return c.json(await listWorkLocationUsers(workLocationId), 200)
})

const unassignWorkLocationUserRoute = createRoute({
  method: 'delete',
  path: '/work-locations/{workLocationId}/users/{userId}',
  operationId: 'unassignWorkLocationUser',
  tags: ['Backoffice'],
  request: {
    params: WorkLocationUserParamSchema
  },
  responses: {
    200: {
      description: 'Employee unassigned from work location',
      content: {
        'application/json': {
          schema: UnassignWorkLocationUserResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(unassignWorkLocationUserRoute, async (c) => {
  ensurePermission(c, permissions.workAreasManage)
  const { workLocationId, userId } = c.req.valid('param')
  return c.json(
    await unassignWorkLocationUser({
      workLocationId,
      userId,
      actorUserId: c.get('currentUser').id,
      c
    }),
    200
  )
})

const getUserWorkAreasRoute = createRoute({
  method: 'get',
  path: '/users/{userId}/work-areas',
  operationId: 'getUserWorkAreas',
  tags: ['Backoffice'],
  request: {
    params: UuidParamSchema
  },
  responses: {
    200: {
      description: 'Current active employee work areas',
      content: {
        'application/json': {
          schema: EmployeeWorkAreasResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(getUserWorkAreasRoute, async (c) => {
  ensurePermission(c, permissions.workAreasRead)
  const { userId } = c.req.valid('param')
  return c.json(await getUserWorkAreas(userId), 200)
})

const setUserWorkAreaRoute = createRoute({
  method: 'put',
  path: '/users/{userId}/work-area',
  operationId: 'setUserWorkArea',
  tags: ['Backoffice'],
  request: {
    params: UuidParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: SetEmployeeWorkAreaRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Employee work area set',
      content: {
        'application/json': {
          schema: EmployeeWorkAreasResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(setUserWorkAreaRoute, async (c) => {
  ensurePermission(c, permissions.workAreasManage)
  const { userId } = c.req.valid('param')
  const payload = c.req.valid('json')
  return c.json(
    await setUserWorkArea({
      userId,
      payload,
      actorUserId: c.get('currentUser').id,
      c
    }),
    200
  )
})

const listAttendanceRoute = createRoute({
  method: 'get',
  path: '/attendance',
  operationId: 'listAttendance',
  tags: ['Backoffice'],
  request: {
    query: ListAttendanceQuerySchema
  },
  responses: {
    200: {
      description: 'Attendance days list',
      content: {
        'application/json': {
          schema: ListAttendanceResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listAttendanceRoute, async (c) => {
  ensurePermission(c, permissions.attendanceRead)
  return c.json(await listAttendance(c.req.valid('query')), 200)
})

const getAttendanceDayRoute = createRoute({
  method: 'get',
  path: '/attendance/{attendanceDayId}',
  operationId: 'getAttendanceDay',
  tags: ['Backoffice'],
  request: {
    params: AttendanceDayIdParamSchema
  },
  responses: {
    200: {
      description: 'Attendance day detail',
      content: {
        'application/json': {
          schema: AttendanceDayResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(getAttendanceDayRoute, async (c) => {
  ensurePermission(c, permissions.attendanceRead)
  const { attendanceDayId } = c.req.valid('param')
  return c.json(await getAttendanceDay(attendanceDayId), 200)
})

const reviewAttendanceRoute = createRoute({
  method: 'patch',
  path: '/attendance/{attendanceDayId}/review',
  operationId: 'reviewAttendance',
  tags: ['Backoffice'],
  request: {
    params: AttendanceDayIdParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ReviewAttendanceRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Attendance day reviewed',
      content: {
        'application/json': {
          schema: AttendanceDayResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(reviewAttendanceRoute, async (c) => {
  ensurePermission(c, permissions.attendanceReview)
  const { attendanceDayId } = c.req.valid('param')
  return c.json(
    await reviewAttendance({
      attendanceDayId,
      payload: c.req.valid('json'),
      reviewerId: c.get('currentUser').id,
      c
    }),
    200
  )
})

const listAreaInspectionsRoute = createRoute({
  method: 'get',
  path: '/area-inspections',
  operationId: 'listAreaInspections',
  tags: ['Backoffice'],
  request: {
    query: ListAreaInspectionsQuerySchema
  },
  responses: {
    200: {
      description: 'Area inspections list',
      content: {
        'application/json': {
          schema: ListAreaInspectionsResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listAreaInspectionsRoute, async (c) => {
  ensurePermission(c, permissions.areaInspectionsRead)
  return c.json(await listAreaInspections(c.req.valid('query')), 200)
})

const reviewAreaInspectionRoute = createRoute({
  method: 'patch',
  path: '/area-inspections/{areaInspectionId}/review',
  operationId: 'reviewAreaInspection',
  tags: ['Backoffice'],
  request: {
    params: AreaInspectionIdParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ReviewAreaInspectionRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Area inspection reviewed',
      content: {
        'application/json': {
          schema: AreaInspectionResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(reviewAreaInspectionRoute, async (c) => {
  ensurePermission(c, permissions.areaInspectionsReview)
  return c.json(
    await reviewAreaInspection({
      areaInspectionId: c.req.valid('param').areaInspectionId,
      payload: c.req.valid('json'),
      reviewerId: c.get('currentUser').id,
      c
    }),
    200
  )
})

const deleteAreaInspectionRoute = createRoute({
  method: 'delete',
  path: '/area-inspections/{areaInspectionId}',
  operationId: 'deleteAreaInspectionAdmin',
  tags: ['Backoffice'],
  request: {
    params: AreaInspectionIdParamSchema
  },
  responses: {
    200: {
      description: 'Area inspection deleted',
      content: {
        'application/json': {
          schema: DeleteAreaInspectionResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(deleteAreaInspectionRoute, async (c) => {
  ensurePermission(c, permissions.areaInspectionsDelete)
  return c.json(
    await deleteAreaInspection({
      areaInspectionId: c.req.valid('param').areaInspectionId,
      actorUserId: c.get('currentUser').id,
      c
    }),
    200
  )
})

const listEmergencyLogsRoute = createRoute({
  method: 'get',
  path: '/emergency-logs',
  operationId: 'listEmergencyLogs',
  tags: ['Backoffice'],
  request: {
    query: ListEmergencyLogsQuerySchema
  },
  responses: {
    200: {
      description: 'Emergency logs list',
      content: {
        'application/json': {
          schema: ListEmergencyLogsResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listEmergencyLogsRoute, async (c) => {
  ensurePermission(c, permissions.emergencyRead)
  return c.json(await listEmergencyLogs(c.req.valid('query')), 200)
})

const getEmergencyLogRoute = createRoute({
  method: 'get',
  path: '/emergency-logs/{emergencyLogId}',
  operationId: 'getEmergencyLog',
  tags: ['Backoffice'],
  request: {
    params: EmergencyLogIdParamSchema
  },
  responses: {
    200: {
      description: 'Emergency log detail',
      content: {
        'application/json': {
          schema: EmergencyLogResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(getEmergencyLogRoute, async (c) => {
  ensurePermission(c, permissions.emergencyRead)
  const { emergencyLogId } = c.req.valid('param')
  return c.json(await getEmergencyLog(emergencyLogId), 200)
})

const updateEmergencyLogRoute = createRoute({
  method: 'patch',
  path: '/emergency-logs/{emergencyLogId}',
  operationId: 'updateEmergencyLog',
  tags: ['Backoffice'],
  request: {
    params: EmergencyLogIdParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: UpdateEmergencyLogRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Emergency log updated',
      content: {
        'application/json': {
          schema: EmergencyLogResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(updateEmergencyLogRoute, async (c) => {
  ensurePermission(c, permissions.emergencyUpdate)
  const { emergencyLogId } = c.req.valid('param')
  return c.json(
    await updateEmergencyLog({
      emergencyLogId,
      payload: c.req.valid('json'),
      handledBy: c.get('currentUser').id,
      c
    }),
    200
  )
})

const createSalaryUploadUrlRoute = createRoute({
  method: 'post',
  path: '/salary/upload-url',
  operationId: 'createSalaryUploadUrl',
  tags: ['Backoffice'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateSalaryUploadUrlRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Signed upload URL for salary Excel file',
      content: {
        'application/json': {
          schema: CreateSalaryUploadUrlResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(createSalaryUploadUrlRoute, async (c) => {
  ensurePermission(c, permissions.salaryUpload)
  return c.json(
    await createSalaryUploadUrl({
      payload: c.req.valid('json'),
      uploadedBy: c.get('currentUser').id
    }),
    201
  )
})

const importSalaryRoute = createRoute({
  method: 'post',
  path: '/salary/import',
  operationId: 'importSalaryUpload',
  tags: ['Backoffice'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ImportSalaryRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Salary Excel file imported',
      content: {
        'application/json': {
          schema: ImportSalaryResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(importSalaryRoute, async (c) => {
  ensurePermission(c, permissions.salaryUpload)
  return c.json(
    await importSalaryUpload({
      uploadBatchId: c.req.valid('json').uploadBatchId,
      importedBy: c.get('currentUser').id,
      c
    }),
    200
  )
})

const listSalaryUploadsRoute = createRoute({
  method: 'get',
  path: '/salary/uploads',
  operationId: 'listSalaryUploads',
  tags: ['Backoffice'],
  request: {
    query: ListSalaryUploadsQuerySchema
  },
  responses: {
    200: {
      description: 'Salary upload batches list',
      content: {
        'application/json': {
          schema: ListSalaryUploadsResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listSalaryUploadsRoute, async (c) => {
  ensurePermission(c, permissions.salaryRead)
  return c.json(await listSalaryUploads(c.req.valid('query')), 200)
})

const deleteSalaryUploadRoute = createRoute({
  method: 'delete',
  path: '/salary/uploads/{uploadBatchId}',
  operationId: 'deleteSalaryUpload',
  tags: ['Backoffice'],
  request: {
    params: SalaryUploadBatchIdParamSchema
  },
  responses: {
    200: {
      description: 'Salary upload batch and imported records deleted',
      content: {
        'application/json': {
          schema: DeleteSalaryUploadResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(deleteSalaryUploadRoute, async (c) => {
  ensurePermission(c, permissions.salaryDelete)
  const { uploadBatchId } = c.req.valid('param')
  return c.json(
    await deleteSalaryUpload({
      uploadBatchId,
      deletedBy: c.get('currentUser').id,
      c
    }),
    200
  )
})

const listSalaryRecordsRoute = createRoute({
  method: 'get',
  path: '/salary/records',
  operationId: 'listSalaryRecords',
  tags: ['Backoffice'],
  request: {
    query: ListSalaryRecordsQuerySchema
  },
  responses: {
    200: {
      description: 'Salary records list',
      content: {
        'application/json': {
          schema: ListSalaryRecordsResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listSalaryRecordsRoute, async (c) => {
  ensurePermission(c, permissions.salaryRead)
  return c.json(await listSalaryRecords(c.req.valid('query')), 200)
})

const deleteSalaryRecordRoute = createRoute({
  method: 'delete',
  path: '/salary/records/{salaryRecordId}',
  operationId: 'deleteSalaryRecord',
  tags: ['Backoffice'],
  request: {
    params: SalaryRecordIdParamSchema
  },
  responses: {
    200: {
      description: 'Salary record deleted',
      content: {
        'application/json': {
          schema: DeleteSalaryRecordResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(deleteSalaryRecordRoute, async (c) => {
  ensurePermission(c, permissions.salaryDelete)
  const { salaryRecordId } = c.req.valid('param')
  return c.json(
    await deleteSalaryRecord({
      salaryRecordId,
      deletedBy: c.get('currentUser').id,
      c
    }),
    200
  )
})

const listAuditLogsRoute = createRoute({
  method: 'get',
  path: '/audit-logs',
  operationId: 'listAuditLogs',
  tags: ['Backoffice'],
  request: {
    query: LogsQuerySchema
  },
  responses: {
    200: {
      description: 'Audit logs list',
      content: {
        'application/json': {
          schema: ListAuditLogsResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listAuditLogsRoute, async (c) => {
  ensurePermission(c, permissions.logsRead)
  return c.json(await listAuditLogs(c.req.valid('query')), 200)
})

const listEventLogsRoute = createRoute({
  method: 'get',
  path: '/event-logs',
  operationId: 'listEventLogs',
  tags: ['Backoffice'],
  request: {
    query: LogsQuerySchema
  },
  responses: {
    200: {
      description: 'Event logs list',
      content: {
        'application/json': {
          schema: ListEventLogsResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

backofficeRoutes.openapi(listEventLogsRoute, async (c) => {
  ensurePermission(c, permissions.logsRead)
  return c.json(await listEventLogs(c.req.valid('query')), 200)
})
