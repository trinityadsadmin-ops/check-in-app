import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { env } from './config/env.js'
import { registerOpenApi } from './config/openapi.js'
import { errorHandler } from './core/errors/error-handler.js'
import { notFound } from './core/errors/http-error.js'
import { actionLog } from './middlewares/action-log.js'
import { contextMiddleware } from './middlewares/context.js'
import { rateLimit } from './middlewares/rate-limit.js'
import { requestLogger } from './middlewares/request-logger.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { backofficeRoutes } from './modules/backoffice/backoffice.routes.js'
import { frontendRoutes } from './modules/frontend/frontend.routes.js'
import { internalRoutes } from './modules/internal/internal.routes.js'
import { mobileRoutes } from './modules/mobile/mobile.routes.js'
import { HealthResponseSchema } from './shared/schemas/common.js'
import type { AppEnv } from './types/hono.js'

export function createApp() {
  const app = new OpenAPIHono<AppEnv>({ strict: false })

  app.onError(errorHandler)

  app.use('*', contextMiddleware)
  app.use('*', secureHeaders())
  app.use(
    '*',
    cors({
      origin: env.CORS_ORIGINS,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'X-Request-Id',
        'X-Action-Id',
        'X-Device-Id',
        'X-Device-Counter',
        'X-Device-Signature',
        'X-Device-Key',
        'X-Device-Fingerprint'
      ],
      exposeHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
      credentials: true,
      maxAge: 600
    })
  )
  app.use('*', rateLimit)
  app.use('*', requestLogger)
  app.use('*', actionLog)

  const healthRoute = createRoute({
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    tags: ['Health'],
    responses: {
      200: {
        description: 'Service is healthy',
        content: {
          'application/json': {
            schema: HealthResponseSchema
          }
        }
      }
    }
  })

  app.openapi(healthRoute, (c) => {
    return c.json({
      status: 'ok' as const,
      service: env.APP_NAME,
      version: env.APP_VERSION,
      timestamp: new Date().toISOString()
    })
  })

  app.route(`${env.API_BASE_PATH}/auth`, authRoutes)
  app.route(`${env.API_BASE_PATH}/frontend`, frontendRoutes)
  app.route(`${env.API_BASE_PATH}/mobile`, mobileRoutes)
  app.route(`${env.API_BASE_PATH}/backoffice`, backofficeRoutes)
  app.route(`${env.API_BASE_PATH}/internal`, internalRoutes)

  registerOpenApi(app)

  app.notFound(() => {
    throw notFound()
  })

  return app
}

export const app = createApp()
