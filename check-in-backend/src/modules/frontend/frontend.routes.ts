import { randomUUID } from 'node:crypto'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { requireAuth } from '../../middlewares/auth.js'
import { ErrorResponseSchema } from '../../shared/schemas/common.js'
import type { AppEnv } from '../../types/hono.js'
import {
  ListAreaInspectionsResponseSchema,
  ListSiteAreaInspectionsQuerySchema
} from '../area-inspection/area-inspection.schemas.js'
import { listSiteAreaInspections } from '../area-inspection/area-inspection.service.js'
import { mapProfile } from '../auth/auth.service.js'
import {
  CreateCheckInResponseSchema,
  CreateCheckInRequestSchema,
  FrontendProfileResponseSchema,
  FrontendWorkAreasResponseSchema,
  ListFrontendAttendanceQuerySchema,
  ListFrontendAttendanceResponseSchema,
  ListFrontendPayslipsQuerySchema,
  ListFrontendPayslipsResponseSchema
} from './frontend.schemas.js'
import { getOwnWorkAreas, listOwnAttendance, listOwnPayslips } from './frontend.service.js'

export const frontendRoutes = new OpenAPIHono<AppEnv>()

frontendRoutes.use('*', requireAuth)

const profileRoute = createRoute({
  method: 'get',
  path: '/profile',
  operationId: 'getFrontendProfile',
  tags: ['Frontend'],
  responses: {
    200: {
      description: 'Frontend user profile',
      content: {
        'application/json': {
          schema: FrontendProfileResponseSchema
        }
      }
    },
    401: {
      description: 'Missing or invalid access token',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
})

frontendRoutes.openapi(profileRoute, (c) => {
  return c.json({ user: mapProfile(c.get('currentUser')) }, 200)
})

const createCheckInRoute = createRoute({
  method: 'post',
  path: '/check-ins',
  operationId: 'createCheckIn',
  tags: ['Frontend'],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateCheckInRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Check-in created',
      content: {
        'application/json': {
          schema: CreateCheckInResponseSchema
        }
      }
    },
    401: {
      description: 'Missing or invalid access token',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
})

frontendRoutes.openapi(createCheckInRoute, (c) => {
  const payload = c.req.valid('json')
  const user = c.get('authUser')

  return c.json(
    {
      id: randomUUID(),
      locationId: payload.locationId,
      userId: user.id,
      checkedInAt: new Date().toISOString(),
      note: payload.note ?? null
    },
    201
  )
})

const listAttendanceRoute = createRoute({
  method: 'get',
  path: '/attendance',
  operationId: 'listFrontendAttendance',
  tags: ['Frontend'],
  request: {
    query: ListFrontendAttendanceQuerySchema
  },
  responses: {
    200: {
      description: "Current user's attendance days, newest first",
      content: {
        'application/json': {
          schema: ListFrontendAttendanceResponseSchema
        }
      }
    },
    401: {
      description: 'Missing or invalid access token',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
})

frontendRoutes.openapi(listAttendanceRoute, async (c) => {
  return c.json(
    await listOwnAttendance({
      userId: c.get('currentUser').id,
      query: c.req.valid('query')
    }),
    200
  )
})

const listPayslipsRoute = createRoute({
  method: 'get',
  path: '/payslips',
  operationId: 'listFrontendPayslips',
  tags: ['Frontend'],
  request: {
    query: ListFrontendPayslipsQuerySchema
  },
  responses: {
    200: {
      description: "Current user's salary records (payslips), newest period first",
      content: {
        'application/json': {
          schema: ListFrontendPayslipsResponseSchema
        }
      }
    },
    401: {
      description: 'Missing or invalid access token',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
})

frontendRoutes.openapi(listPayslipsRoute, async (c) => {
  return c.json(
    await listOwnPayslips({
      userId: c.get('currentUser').id,
      query: c.req.valid('query')
    }),
    200
  )
})

const listAreaInspectionsRoute = createRoute({
  method: 'get',
  path: '/area-inspections',
  operationId: 'listSiteAreaInspections',
  tags: ['Frontend'],
  request: {
    query: ListSiteAreaInspectionsQuerySchema
  },
  responses: {
    200: {
      description: "Area inspections for the caller's work site, newest first",
      content: {
        'application/json': {
          schema: ListAreaInspectionsResponseSchema
        }
      }
    },
    401: {
      description: 'Missing or invalid access token',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
})

frontendRoutes.openapi(listAreaInspectionsRoute, async (c) => {
  return c.json(
    await listSiteAreaInspections({
      userId: c.get('currentUser').id,
      query: c.req.valid('query')
    }),
    200
  )
})

const workAreasRoute = createRoute({
  method: 'get',
  path: '/work-areas',
  operationId: 'getFrontendWorkAreas',
  tags: ['Frontend'],
  responses: {
    200: {
      description: "Current user's assigned work areas (geofences) + work locations",
      content: {
        'application/json': {
          schema: FrontendWorkAreasResponseSchema
        }
      }
    },
    401: {
      description: 'Missing or invalid access token',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
})

frontendRoutes.openapi(workAreasRoute, async (c) => {
  return c.json(await getOwnWorkAreas(c.get('currentUser').id), 200)
})
