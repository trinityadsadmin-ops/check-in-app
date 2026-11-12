import type { MiddlewareHandler } from 'hono'
import { requiresTrustedDevice, verifyTrustedDevice } from '../modules/auth/device.service.js'
import type { AppEnv } from '../types/hono.js'

/**
 * Requires app users (anyone with mobile attendance/emergency permissions) to
 * call from their bound, signed device on every request — not only at sign-in —
 * so a copied session token is useless without the device key. Must run after
 * `requireAuth`.
 */
export const requireTrustedDevice: MiddlewareHandler<AppEnv> = async (c, next) => {
  const profile = c.get('currentUser')

  if (requiresTrustedDevice(profile)) {
    await verifyTrustedDevice({ profile, c, allowBind: false })
  }

  await next()
}
