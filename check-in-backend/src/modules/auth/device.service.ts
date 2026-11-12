import { type AppError, badRequest, deviceError } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { writeAuditLog, writeEventLog } from '../logs/logs.service.js'
import type { AppProfile } from './profile.service.js'
import { hasAnyPermission } from './profile.service.js'
import { mobileDevicePermissions } from './permissions.js'
import type { Context } from 'hono'
import type { AppEnv } from '../../types/hono.js'
import {
  buildSignedPayload,
  deviceHeaders,
  diffFingerprints,
  isHardwareChange,
  parseCounter,
  parseDeviceFingerprint,
  parseDevicePublicKey,
  sameDevicePublicKey,
  verifyDeviceSignature,
  type DeviceFingerprint,
  type DevicePublicKey
} from './device-trust.js'

type DeviceBindingRow = {
  id: string
  user_id: string
  device_uuid: string
  is_active: boolean
  bound_at: string
  reset_at: string | null
  reset_by: string | null
  public_key_jwk: DevicePublicKey | null
  fingerprint: DeviceFingerprint | null
  locked_at: string | null
  lock_reason: string | null
  last_seen_at: string | null
}

export type DeviceBindingResult = {
  deviceUuid: string
  isNewBinding: boolean
}

export type DeviceLockReason = 'CLONE_SUSPECTED' | 'KEY_MISMATCH' | 'DEVICE_CHANGED'

const deviceBindingSelect =
  'id,user_id,device_uuid,is_active,bound_at,reset_at,reset_by,public_key_jwk,fingerprint,locked_at,lock_reason,last_seen_at'

export async function getActiveDeviceBinding(userId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('device_bindings')
    .select(deviceBindingSelect)
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

/** Users who check in from the app must always present their bound device. */
export function requiresTrustedDevice(profile: AppProfile) {
  return hasAnyPermission(profile, mobileDevicePermissions)
}

type DeviceProof = {
  deviceUuid: string | undefined
  counter: number | null
  signature: string | undefined
  publicKey: DevicePublicKey | null
  fingerprint: DeviceFingerprint | null
  payload: string | null
}

function readDeviceProof(c: Context<AppEnv>, deviceUuid: string | undefined): DeviceProof {
  const id = deviceUuid ?? c.req.header(deviceHeaders.id)
  const counter = parseCounter(c.req.header(deviceHeaders.counter))
  return {
    deviceUuid: id,
    counter,
    signature: c.req.header(deviceHeaders.signature),
    publicKey: parseDevicePublicKey(c.req.header(deviceHeaders.key)),
    fingerprint: parseDeviceFingerprint(c.req.header(deviceHeaders.fingerprint)),
    payload:
      id && counter !== null
        ? buildSignedPayload({ deviceId: id, counter, method: c.req.method, path: c.req.path })
        : null
  }
}

async function rejectDevice(input: {
  profile: AppProfile
  c: Context<AppEnv>
  binding: DeviceBindingRow | null
  reason: string
  error: AppError
  metadata?: Record<string, unknown>
}): Promise<never> {
  await writeEventLog({
    actorUserId: input.profile.id,
    eventType: 'device.request_rejected',
    severity: 'WARN',
    resourceType: 'device_binding',
    resourceId: input.binding?.id ?? null,
    metadata: { reason: input.reason, path: input.c.req.path, ...input.metadata },
    c: input.c
  })
  throw input.error
}

async function lockDevice(input: {
  profile: AppProfile
  c: Context<AppEnv>
  binding: DeviceBindingRow
  reason: DeviceLockReason
  metadata?: Record<string, unknown>
}): Promise<never> {
  const supabaseAdmin = requireSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('device_bindings')
    .update({ locked_at: new Date().toISOString(), lock_reason: input.reason })
    .eq('id', input.binding.id)
    .is('locked_at', null)

  if (error) {
    input.c.get('logger').error({ error }, 'Unable to lock device binding')
  }

  const metadata = { reason: input.reason, path: input.c.req.path, ...input.metadata }
  await writeAuditLog({
    actorUserId: input.profile.id,
    action: 'device.locked',
    resourceType: 'device_binding',
    resourceId: input.binding.id,
    metadata,
    c: input.c
  })
  await writeEventLog({
    actorUserId: input.profile.id,
    eventType: 'device.locked',
    severity: 'ERROR',
    resourceType: 'device_binding',
    resourceId: input.binding.id,
    metadata,
    c: input.c
  })

  throw deviceError('DEVICE_LOCKED', 'This device has been locked for review. Please contact your administrator.')
}

/**
 * Verifies that a request comes from the user's bound device:
 *
 * 1. The device id matches the active binding (one device per account).
 * 2. The request is signed by the binding's non-extractable device key, so a
 *    copied device id alone is useless.
 * 3. The signed counter has never been used before. A cloned install (e.g. a
 *    phone-to-phone storage transfer) shares the key *and* the counter with the
 *    original, so as soon as both are used they replay each other's counters.
 * 4. The device's hardware traits have not changed since enrolment.
 *
 * 2–4 lock the binding (an administrator must reset it). Bindings created
 * before keys existed enrol their key on first use, so nobody is locked out by
 * the rollout.
 *
 * `allowBind` (sign-in only) creates a binding when the account has none.
 */
export async function verifyTrustedDevice(input: {
  profile: AppProfile
  c: Context<AppEnv>
  allowBind: boolean
  deviceUuid?: string | undefined
}): Promise<DeviceBindingResult> {
  const { profile, c } = input
  const proof = readDeviceProof(c, input.deviceUuid)
  const supabaseAdmin = requireSupabaseAdmin()
  let binding = await getActiveDeviceBinding(profile.id)
  let isNewBinding = false

  if (!binding) {
    if (!input.allowBind) {
      return rejectDevice({
        profile,
        c,
        binding,
        reason: 'DEVICE_NOT_BOUND',
        error: deviceError('DEVICE_NOT_BOUND', 'No device is bound to this account. Please sign in again.')
      })
    }

    if (!proof.deviceUuid || !proof.publicKey || !proof.fingerprint || !proof.payload) {
      return rejectDevice({
        profile,
        c,
        binding,
        reason: 'DEVICE_KEY_REQUIRED',
        error: deviceError('DEVICE_KEY_REQUIRED', 'This browser cannot be registered as a secure device.')
      })
    }

    if (!(await verifyDeviceSignature(proof.publicKey, proof.payload, proof.signature))) {
      return rejectDevice({
        profile,
        c,
        binding,
        reason: 'SIGNATURE_INVALID',
        error: deviceError('DEVICE_SIGNATURE_REQUIRED', 'Device signature is invalid.')
      })
    }

    const { data, error } = await supabaseAdmin
      .from('device_bindings')
      .insert({
        user_id: profile.id,
        device_uuid: proof.deviceUuid,
        public_key_jwk: proof.publicKey,
        key_enrolled_at: new Date().toISOString(),
        fingerprint: proof.fingerprint
      })
      .select(deviceBindingSelect)
      .single()

    if (error || !data) {
      throw badRequest(error?.message ?? 'Unable to bind device')
    }

    binding = data as DeviceBindingRow
    isNewBinding = true

    await writeEventLog({
      actorUserId: profile.id,
      eventType: 'device.bound',
      resourceType: 'device_binding',
      resourceId: binding.id,
      metadata: { clientType: 'MOBILE', fingerprint: proof.fingerprint },
      c
    })
  }

  if (binding.locked_at) {
    return rejectDevice({
      profile,
      c,
      binding,
      reason: 'DEVICE_LOCKED',
      error: deviceError('DEVICE_LOCKED', 'This device has been locked for review. Please contact your administrator.')
    })
  }

  if (!proof.deviceUuid || proof.deviceUuid !== binding.device_uuid) {
    // Sign-in from another device keeps its historical event name.
    await writeEventLog({
      actorUserId: profile.id,
      eventType: input.allowBind ? 'device.login_rejected' : 'device.request_rejected',
      severity: 'WARN',
      resourceType: 'device_binding',
      resourceId: binding.id,
      metadata: {
        reason: proof.deviceUuid ? 'DEVICE_MISMATCH' : 'DEVICE_UUID_REQUIRED',
        clientType: 'MOBILE',
        path: c.req.path
      },
      c
    })
    throw deviceError('DEVICE_MISMATCH', 'This account is bound to another device')
  }

  if (!proof.payload || !proof.signature || !proof.fingerprint) {
    return rejectDevice({
      profile,
      c,
      binding,
      reason: 'SIGNATURE_MISSING',
      error: deviceError('DEVICE_SIGNATURE_REQUIRED', 'Device signature is required. Please update the app.')
    })
  }

  // Legacy binding (created before device keys): enrol this key on first use.
  if (!binding.public_key_jwk) {
    if (!proof.publicKey) {
      return rejectDevice({
        profile,
        c,
        binding,
        reason: 'DEVICE_KEY_REQUIRED',
        error: deviceError('DEVICE_KEY_REQUIRED', 'Device key is required. Please update the app.')
      })
    }
    if (!(await verifyDeviceSignature(proof.publicKey, proof.payload, proof.signature))) {
      return rejectDevice({
        profile,
        c,
        binding,
        reason: 'SIGNATURE_INVALID',
        error: deviceError('DEVICE_SIGNATURE_REQUIRED', 'Device signature is invalid.')
      })
    }

    const { data, error } = await supabaseAdmin
      .from('device_bindings')
      .update({
        public_key_jwk: proof.publicKey,
        key_enrolled_at: new Date().toISOString(),
        fingerprint: binding.fingerprint ?? proof.fingerprint
      })
      .eq('id', binding.id)
      .is('public_key_jwk', null)
      .select(deviceBindingSelect)

    if (error) {
      throw badRequest(error.message)
    }

    if (data && data.length > 0) {
      binding = data[0] as DeviceBindingRow
      await writeEventLog({
        actorUserId: profile.id,
        eventType: 'device.key_enrolled',
        resourceType: 'device_binding',
        resourceId: binding.id,
        metadata: { fingerprint: proof.fingerprint },
        c
      })
    } else {
      // Another request enrolled a key first; verify against that one.
      binding = (await getActiveDeviceBinding(profile.id)) ?? binding
    }
  }

  const enrolledKey = binding.public_key_jwk ? parseDevicePublicKey(binding.public_key_jwk) : null
  if (!enrolledKey || !(await verifyDeviceSignature(enrolledKey, proof.payload, proof.signature))) {
    // Right device id, wrong key: the id was copied onto another install.
    return lockDevice({
      profile,
      c,
      binding,
      reason: 'KEY_MISMATCH',
      metadata: {
        presentedKeyDiffers: Boolean(
          proof.publicKey && enrolledKey && !sameDevicePublicKey(proof.publicKey, enrolledKey)
        )
      }
    })
  }

  if (binding.fingerprint) {
    const changed = diffFingerprints(binding.fingerprint, proof.fingerprint)
    if (isHardwareChange(changed)) {
      return lockDevice({
        profile,
        c,
        binding,
        reason: 'DEVICE_CHANGED',
        metadata: { changed, enrolled: binding.fingerprint, presented: proof.fingerprint }
      })
    }
    if (changed.length > 0) {
      // A single non-screen trait changed (likely a browser update): accept,
      // record it, and track the new value so drift can't accumulate unseen.
      await supabaseAdmin
        .from('device_bindings')
        .update({ fingerprint: { ...binding.fingerprint, ...proof.fingerprint } })
        .eq('id', binding.id)
      await writeEventLog({
        actorUserId: profile.id,
        eventType: 'device.fingerprint_drift',
        severity: 'WARN',
        resourceType: 'device_binding',
        resourceId: binding.id,
        metadata: { changed, enrolled: binding.fingerprint, presented: proof.fingerprint },
        c
      })
    }
  } else {
    await supabaseAdmin
      .from('device_bindings')
      .update({ fingerprint: proof.fingerprint })
      .eq('id', binding.id)
      .is('fingerprint', null)
  }

  const { data: counterResult, error: counterError } = await supabaseAdmin.rpc(
    'device_binding_use_counter',
    { p_binding_id: binding.id, p_counter: proof.counter }
  )

  if (counterError) {
    throw badRequest(counterError.message)
  }

  if (counterResult === 'REPLAY') {
    return lockDevice({
      profile,
      c,
      binding,
      reason: 'CLONE_SUSPECTED',
      metadata: { counter: proof.counter }
    })
  }

  if (counterResult === 'LOCKED') {
    throw deviceError('DEVICE_LOCKED', 'This device has been locked for review. Please contact your administrator.')
  }

  if (counterResult !== 'OK') {
    throw deviceError('DEVICE_NOT_BOUND', 'No device is bound to this account. Please sign in again.')
  }

  c.set('deviceUuid', binding.device_uuid)
  return { deviceUuid: binding.device_uuid, isNewBinding }
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
