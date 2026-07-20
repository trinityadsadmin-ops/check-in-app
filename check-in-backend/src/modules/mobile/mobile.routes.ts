import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { forbidden } from '../../core/errors/http-error.js'
import { requireAuth } from '../../middlewares/auth.js'
import { ErrorResponseSchema } from '../../shared/schemas/common.js'
import type { AppEnv } from '../../types/hono.js'
import {
  ConfirmAttendanceRequestSchema,
  ConfirmAttendanceResponseSchema,
  CreateAttendanceUploadUrlRequestSchema,
  CreateAttendanceUploadUrlResponseSchema
} from '../attendance/attendance.schemas.js'
import {
  confirmAttendance,
  createAttendanceUploadUrl
} from '../attendance/attendance.service.js'
import {
  AreaInspectionIdParamSchema,
  AreaInspectionResponseSchema,
  CreateAreaInspectionRequestSchema,
  CreateAreaInspectionUploadUrlRequestSchema,
  CreateAreaInspectionUploadUrlResponseSchema,
  DeleteAreaInspectionResponseSchema
} from '../area-inspection/area-inspection.schemas.js'
import {
  createAreaInspection,
  createAreaInspectionUploadUrl,
  deleteOwnAreaInspection
} from '../area-inspection/area-inspection.service.js'
import { permissions } from '../auth/permissions.js'
import {
  CreateEmergencyRequestSchema,
  CreateEmergencyResponseSchema,
  EmergencyLogIdParamSchema,
  EmergencyLogResponseSchema,
  ListActiveEmergenciesResponseSchema
} from '../emergency/emergency.schemas.js'
import {
  cancelOwnEmergency,
  createEmergencyLog,
  listActiveEmergencies
} from '../emergency/emergency.service.js'

export const mobileRoutes = new OpenAPIHono<AppEnv>()

mobileRoutes.use('*', requireAuth)

function ensurePermission(c: Context<AppEnv>, permission: string) {
  if (!c.get('currentUser').permissions.includes(permission)) {
    throw forbidden(`Missing permission: ${permission}`)
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

const createAttendanceUploadUrlRoute = createRoute({
  method: 'post',
  path: '/attendance/upload-url',
  operationId: 'createAttendanceUploadUrl',
  tags: ['Mobile'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateAttendanceUploadUrlRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Signed upload URL for attendance photo',
      content: {
        'application/json': {
          schema: CreateAttendanceUploadUrlResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

mobileRoutes.openapi(createAttendanceUploadUrlRoute, async (c) => {
  ensurePermission(c, permissions.mobileAttendance)
  const payload = c.req.valid('json')
  return c.json(
    await createAttendanceUploadUrl({
      userId: c.get('currentUser').id,
      payload
    }),
    201
  )
})

const checkInRoute = createRoute({
  method: 'post',
  path: '/attendance/check-in',
  operationId: 'checkIn',
  tags: ['Mobile'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ConfirmAttendanceRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Check-in created',
      content: {
        'application/json': {
          schema: ConfirmAttendanceResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

mobileRoutes.openapi(checkInRoute, async (c) => {
  ensurePermission(c, permissions.mobileAttendance)
  return c.json(
    await confirmAttendance({
      userId: c.get('currentUser').id,
      eventType: 'CHECK_IN',
      payload: c.req.valid('json'),
      c
    }),
    201
  )
})

const checkOutRoute = createRoute({
  method: 'post',
  path: '/attendance/check-out',
  operationId: 'checkOut',
  tags: ['Mobile'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ConfirmAttendanceRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Check-out created',
      content: {
        'application/json': {
          schema: ConfirmAttendanceResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

mobileRoutes.openapi(checkOutRoute, async (c) => {
  ensurePermission(c, permissions.mobileAttendance)
  return c.json(
    await confirmAttendance({
      userId: c.get('currentUser').id,
      eventType: 'CHECK_OUT',
      payload: c.req.valid('json'),
      c
    }),
    201
  )
})

const createAreaInspectionUploadUrlRoute = createRoute({
  method: 'post',
  path: '/area-inspections/upload-url',
  operationId: 'createAreaInspectionUploadUrl',
  tags: ['Mobile'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateAreaInspectionUploadUrlRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Signed upload URL for an area inspection photo',
      content: {
        'application/json': {
          schema: CreateAreaInspectionUploadUrlResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

mobileRoutes.openapi(createAreaInspectionUploadUrlRoute, async (c) => {
  ensurePermission(c, permissions.mobileAttendance)
  return c.json(
    await createAreaInspectionUploadUrl({
      userId: c.get('currentUser').id,
      payload: c.req.valid('json')
    }),
    201
  )
})

const createAreaInspectionRoute = createRoute({
  method: 'post',
  path: '/area-inspections',
  operationId: 'createAreaInspection',
  tags: ['Mobile'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateAreaInspectionRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Area inspection created',
      content: {
        'application/json': {
          schema: AreaInspectionResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

mobileRoutes.openapi(createAreaInspectionRoute, async (c) => {
  ensurePermission(c, permissions.mobileAttendance)
  return c.json(
    await createAreaInspection({
      userId: c.get('currentUser').id,
      payload: c.req.valid('json'),
      c
    }),
    201
  )
})

const deleteAreaInspectionRoute = createRoute({
  method: 'delete',
  path: '/area-inspections/{areaInspectionId}',
  operationId: 'deleteAreaInspection',
  tags: ['Mobile'],
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

mobileRoutes.openapi(deleteAreaInspectionRoute, async (c) => {
  ensurePermission(c, permissions.mobileAttendance)
  return c.json(
    await deleteOwnAreaInspection({
      areaInspectionId: c.req.valid('param').areaInspectionId,
      userId: c.get('currentUser').id,
      c
    }),
    200
  )
})

const createEmergencyRoute = createRoute({
  method: 'post',
  path: '/emergency',
  operationId: 'createEmergency',
  tags: ['Mobile'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateEmergencyRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Emergency log created',
      content: {
        'application/json': {
          schema: CreateEmergencyResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

mobileRoutes.openapi(createEmergencyRoute, async (c) => {
  ensurePermission(c, permissions.mobileEmergency)
  return c.json(
    await createEmergencyLog({
      userId: c.get('currentUser').id,
      payload: c.req.valid('json'),
      c
    }),
    201
  )
})

const listActiveEmergenciesRoute = createRoute({
  method: 'get',
  path: '/emergency/active',
  operationId: 'listActiveEmergencies',
  tags: ['Mobile'],
  responses: {
    200: {
      description: "OPEN emergency alerts on the caller's site",
      content: {
        'application/json': {
          schema: ListActiveEmergenciesResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

mobileRoutes.openapi(listActiveEmergenciesRoute, async (c) => {
  ensurePermission(c, permissions.mobileEmergency)
  return c.json(await listActiveEmergencies(c.get('currentUser').id), 200)
})

const cancelEmergencyRoute = createRoute({
  method: 'post',
  path: '/emergency/{emergencyLogId}/cancel',
  operationId: 'cancelEmergency',
  tags: ['Mobile'],
  request: {
    params: EmergencyLogIdParamSchema
  },
  responses: {
    200: {
      description: 'Own emergency alert resolved',
      content: {
        'application/json': {
          schema: EmergencyLogResponseSchema
        }
      }
    },
    ...commonErrorResponses
  }
})

mobileRoutes.openapi(cancelEmergencyRoute, async (c) => {
  ensurePermission(c, permissions.mobileEmergency)
  return c.json(
    await cancelOwnEmergency({
      userId: c.get('currentUser').id,
      emergencyLogId: c.req.valid('param').emergencyLogId,
      c
    }),
    200
  )
})
