import { randomUUID } from 'node:crypto'
import { badRequest, forbidden } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { writeAuditLog, writeEventLog } from '../logs/logs.service.js'
import type { AppProfile } from './profile.service.js'
import { hasAnyPermission } from './profile.service.js'
import { mobileDevicePermissions } from './permissions.js'
import type { Context } from 'hono'
import type { AppEnv } from '../../types/hono.js'

type DeviceBindingRow = {
  id: string
  user_id: string
  device_uuid: string
  is_active: boolean
  bound_at: string
  reset_at: string | null
  reset_by: string | null
}

export type DeviceBindingResult = {
  deviceUuid: string
  isNewBinding: boolean
}

export async function getActiveDeviceBinding(userId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('device_bindings')
    .select('id,user_id,device_uuid,is_active,bound_at,reset_at,reset_by')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  return data as DeviceBindingRow | null
}

export function shouldEnforceDeviceBinding(profile: AppProfile, clientType?: 'BACKOFFICE' | 'MOBILE') {
  return clientType === 'MOBILE' && hasAnyPermission(profile, mobileDevicePermissions)
}

export async function enforceDeviceBinding(input: {
  profile: AppProfile
  clientType?: 'BACKOFFICE' | 'MOBILE' | undefined
  deviceUuid?: string | undefined
  c?: Context<AppEnv> | undefined
}): Promise<DeviceBindingResult | null> {
  if (!shouldEnforceDeviceBinding(input.profile, input.clientType)) {
    return null
  }

  const supabaseAdmin = requireSupabaseAdmin()
  const existingBinding = await getActiveDeviceBinding(input.profile.id)

  if (!existingBinding) {
    // Bind to the client-provided uuid (validated as a UUID by the request schema)
    // so the stored binding matches what the device persists; fall back to a
    // server-generated uuid for clients that did not send one.
    const deviceUuid = input.deviceUuid ?? randomUUID()
    const { error } = await supabaseAdmin.from('device_bindings').insert({
      user_id: input.profile.id,
      device_uuid: deviceUuid
    })

    if (error) {
      throw badRequest(error.message)
    }

    await writeEventLog({
      actorUserId: input.profile.id,
      eventType: 'device.bound',
      resourceType: 'device_binding',
      metadata: { clientType: input.clientType },
      c: input.c
    })

    return { deviceUuid, isNewBinding: true }
  }

  if (!input.deviceUuid || input.deviceUuid !== existingBinding.device_uuid) {
    await writeEventLog({
      actorUserId: input.profile.id,
      eventType: 'device.login_rejected',
      severity: 'WARN',
      resourceType: 'device_binding',
      resourceId: existingBinding.id,
      metadata: {
        reason: input.deviceUuid ? 'DEVICE_MISMATCH' : 'DEVICE_UUID_REQUIRED',
        clientType: input.clientType
      },
      c: input.c
    })

    throw forbidden('This account is bound to another device')
  }

  return { deviceUuid: existingBinding.device_uuid, isNewBinding: false }
}

export async function resetDeviceBinding(input: {
  userId: string
  resetBy: string
  reason?: string | undefined
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const activeBinding = await getActiveDeviceBinding(input.userId)

  if (!activeBinding) {
    return { reset: false as const }
  }

  const { error } = await supabaseAdmin
    .from('device_bindings')
    .update({
      is_active: false,
      reset_at: new Date().toISOString(),
      reset_by: input.resetBy,
      reset_reason: input.reason ?? null
    })
    .eq('id', activeBinding.id)

  if (error) {
    throw badRequest(error.message)
  }

  await writeAuditLog({
    actorUserId: input.resetBy,
    action: 'device.reset',
    resourceType: 'device_binding',
    resourceId: activeBinding.id,
    metadata: {
      userId: input.userId,
      reason: input.reason ?? null
    },
    c: input.c
  })

  await writeEventLog({
    actorUserId: input.resetBy,
    eventType: 'device.reset',
    resourceType: 'device_binding',
    resourceId: activeBinding.id,
    metadata: { userId: input.userId },
    c: input.c
  })

  return { reset: true as const }
}
