import type { User } from '@supabase/supabase-js'
import type { AppLogger } from '../core/logger.js'
import type { AppProfile } from '../modules/auth/profile.service.js'

export type AppEnv = {
  Variables: {
    logger: AppLogger
    requestId: string
    authUser: User
    currentUser: AppProfile
    accessToken: string
    /** Bound device of the caller, set once its signature has been verified. */
    deviceUuid: string | undefined
    /** User an unauthenticated route (sign-in) resolved, for action logging. */
    actorUserId: string | undefined
  }
}
