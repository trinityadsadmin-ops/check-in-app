import type { MiddlewareHandler } from 'hono'
import { env } from '../config/env.js'
import { writeServerActionResult } from '../modules/action-logs/action-logs.service.js'
import { resolveActionName } from '../modules/action-logs/action-name.js'
import type { AppEnv } from '../types/hono.js'

/**
 * Records the server-side RESULT of every employee action (check-in/out,
 * inspections, emergencies, sign-in...), success *and* failure, under the
 * client's `X-Action-Id` so it lines up with the app's INTENT record.
 */
export const actionLog: MiddlewareHandler<AppEnv> = async (c, next) => {
  const action = resolveActionName(c.req.method, c.req.path, env.API_BASE_PATH)
  if (!action) {
    await next()
    return
  }

  const receivedAt = new Date().toISOString()
  await next()

  try {
    await writeServerActionResult({ c, action, receivedAt })
  } catch (error) {
    c.get('logger').warn({ error }, 'Unable to write action log')
  }
}
