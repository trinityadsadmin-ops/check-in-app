import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { env } from '../config/env.js'

type SupabaseOptions = NonNullable<Parameters<typeof createClient>[2]>

const supabaseClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  realtime: {
    transport: WebSocket as unknown as NonNullable<
      NonNullable<SupabaseOptions['realtime']>['transport']
    >
  }
} satisfies SupabaseOptions

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  ...supabaseClientOptions
})

export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  ...supabaseClientOptions
})

/**
 * Client for auth calls that create or rotate a session (sign-up, sign-in,
 * refresh). These MUST NOT run on the shared `supabase` singleton: GoTrueClient
 * keeps the last session in memory and single-flights token refreshes per
 * instance, so under concurrent requests one user could be handed another
 * user's session. A throwaway client per call has neither problem.
 * `supabase.auth.getUser(jwt)` is stateless and stays on the shared client.
 */
export function createAuthClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    ...supabaseClientOptions
  })
}
