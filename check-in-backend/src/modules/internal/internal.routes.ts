import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { env } from '../../config/env.js'
import { forbidden } from '../../core/errors/http-error.js'
import { ErrorResponseSchema } from '../../shared/schemas/common.js'
import type { AppEnv } from '../../types/hono.js'
import { RetentionCleanupResponseSchema } from './internal.schemas.js'
import { cleanupAttendanceRetention } from './retention.service.js'

export const internalRoutes = new OpenAPIHono<AppEnv>()

function requireInternalSecret(authorization?: string) {
  const validSecrets = [env.INTERNAL_API_SECRET, env.CRON_SECRET].filter(Boolean)

  if (validSecrets.length === 0) {
    throw forbidden('INTERNAL_API_SECRET or CRON_SECRET is not configured')
  }

  const [scheme, token] = authorization?.split(' ') ?? []

  if (scheme?.toLowerCase() !== 'bearer' || !validSecrets.includes(token)) {
    throw forbidden('Invalid internal API secret')
  }
}

function createRetentionCleanupRoute(method: 'get' | 'post') {
  return createRoute({
    method,
    path: '/retention/cleanup',
    operationId: method === 'get' ? 'cleanupRetentionCron' : 'cleanupRetention',
    tags: ['Internal'],
    responses: {
      200: {
        description: 'Attendance and area inspection retention cleanup result',
        content: {
          'application/json': {
            schema: RetentionCleanupResponseSchema
          }
        }
      },
      403: {
        description: 'Invalid or missing internal secret',
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        }
      }
    }
  })
}

const retentionCleanupPostRoute = createRetentionCleanupRoute('post')
const retentionCleanupGetRoute = createRetentionCleanupRoute('get')

internalRoutes.openapi(retentionCleanupPostRoute, async (c) => {
  requireInternalSecret(c.req.header('authorization'))
  return c.json(await cleanupAttendanceRetention(), 200)
})

internalRoutes.openapi(retentionCleanupGetRoute, async (c) => {
  requireInternalSecret(c.req.header('authorization'))
  return c.json(await cleanupAttendanceRetention(), 200)
})
