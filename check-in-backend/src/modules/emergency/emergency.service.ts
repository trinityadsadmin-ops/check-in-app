import { badRequest, forbidden, notFound } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { writeAuditLog, writeEventLog } from '../logs/logs.service.js'
import {
  findActiveWorkAreaForPoint,
  listActiveWorkAreasForUser
} from '../work-locations/work-location-assignment.service.js'
import type {
  CreateEmergencyRequest,
  ListEmergencyLogsQuery,
  UpdateEmergencyLogRequest
} from './emergency.schemas.js'
import type { Context } from 'hono'
import type { AppEnv } from '../../types/hono.js'

type EmergencyLogRow = {
  id: string
  user_id: string
  work_location_id: string | null
  lat: number | string
  lng: number | string
  emergency_type: string | null
  message: string | null
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
  triggered_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  handled_by: string | null
  created_at: string
}

type EmergencyProfileRow = {
  id: string
  full_name: string | null
  employee_code: string | null
}

type ActiveEmergencyRow = EmergencyLogRow & {
  user?: EmergencyProfileRow | EmergencyProfileRow[] | null
}

function mapEmergencyLog(row: EmergencyLogRow) {
  return {
    id: row.id,
    userId: row.user_id,
    workLocationId: row.work_location_id,
    lat: Number(row.lat),
    lng: Number(row.lng),
    emergencyType: row.emergency_type,
    message: row.message,
    status: row.status,
    triggeredAt: row.triggered_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    handledBy: row.handled_by,
    createdAt: row.created_at
  }
}

function firstProfile(
  value: EmergencyProfileRow | EmergencyProfileRow[] | null | undefined
): EmergencyProfileRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function mapActiveEmergency(row: ActiveEmergencyRow) {
  const profile = firstProfile(row.user)

  return {
    id: row.id,
    userId: row.user_id,
    workLocationId: row.work_location_id,
    lat: Number(row.lat),
    lng: Number(row.lng),
    emergencyType: row.emergency_type,
    message: row.message,
    status: row.status,
    triggeredAt: row.triggered_at,
    user: profile
      ? {
          id: profile.id,
          fullName: profile.full_name,
          employeeCode: profile.employee_code
        }
      : null
  }
}

const emergencySelect =
  'id,user_id,work_location_id,lat,lng,emergency_type,message,status,triggered_at,acknowledged_at,resolved_at,handled_by,created_at'

const activeEmergencySelect = `${emergencySelect},user:profiles!emergency_logs_user_id_fkey(id,full_name,employee_code)`

function mapEmergencyLogWithUser(row: ActiveEmergencyRow) {
  const profile = firstProfile(row.user)

  return {
    ...mapEmergencyLog(row),
    user: profile
      ? {
          id: profile.id,
          fullName: profile.full_name,
          employeeCode: profile.employee_code
        }
      : null
  }
}

export async function createEmergencyLog(input: {
  userId: string
  payload: CreateEmergencyRequest
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  // Snapshot the assigned site containing the emergency GPS point.
  const workArea = await findActiveWorkAreaForPoint(input.userId, {
    lat: input.payload.lat,
    lng: input.payload.lng
  })
  const workLocationId = workArea?.work_location_id ?? null
  const { data, error } = await supabaseAdmin
    .from('emergency_logs')
    .insert({
      user_id: input.userId,
      work_location_id: workLocationId,
      lat: input.payload.lat,
      lng: input.payload.lng,
      emergency_type: input.payload.emergencyType ?? null,
      message: input.payload.message ?? null,
      triggered_at: input.payload.triggeredAt ?? new Date().toISOString()
    })
    .select(emergencySelect)
    .single()

  if (error || !data) {
    throw badRequest(error?.message ?? 'Unable to create emergency log')
  }

  await writeEventLog({
    actorUserId: input.userId,
    eventType: 'emergency.created',
    severity: 'WARN',
    resourceType: 'emergency_log',
    resourceId: (data as EmergencyLogRow).id,
    metadata: {
      lat: input.payload.lat,
      lng: input.payload.lng,
      emergencyType: input.payload.emergencyType ?? null
    },
    c: input.c
  })

  return { emergencyLog: mapEmergencyLog(data as EmergencyLogRow) }
}

/**
 * OPEN alerts visible to a staff device: everything broadcast on the caller's
 * active sites (including the caller's own). Staff with no assigned site only
 * see their own alerts — their rows carry a null work_location_id, which can
 * never match a site filter (mirrors listSiteAreaInspections).
 */
export async function listActiveEmergencies(userId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const workLocationIds = (await listActiveWorkAreasForUser(userId)).map(
    (workArea) => workArea.work_location_id
  )

  let request = supabaseAdmin
    .from('emergency_logs')
    .select(activeEmergencySelect)
    .eq('status', 'OPEN')
    .order('triggered_at', { ascending: false })
    .limit(20)

  request = workLocationIds.length > 0
    ? request.in('work_location_id', workLocationIds)
    : request.eq('user_id', userId)

  const { data, error } = await request

  if (error) {
    throw badRequest(error.message)
  }

  return {
    emergencies: ((data ?? []) as unknown as ActiveEmergencyRow[]).map(
      mapActiveEmergency
    )
  }
}

/** Staff-side cancel: resolves the caller's own alert (any other user is 403). */
export async function cancelOwnEmergency(input: {
  userId: string
  emergencyLogId: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const existing = await getEmergencyLog(input.emergencyLogId)

  if (existing.emergencyLog.userId !== input.userId) {
    throw forbidden('You can only cancel your own emergency alert')
  }

  if (existing.emergencyLog.status === 'RESOLVED') {
    return existing
  }

  const { data, error } = await supabaseAdmin
    .from('emergency_logs')
    .update({ status: 'RESOLVED', resolved_at: new Date().toISOString() })
    .eq('id', input.emergencyLogId)
    .eq('user_id', input.userId)
    .select(emergencySelect)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Emergency log was not found')
  }

  await writeEventLog({
    actorUserId: input.userId,
    eventType: 'emergency.cancelled',
    severity: 'WARN',
    resourceType: 'emergency_log',
    resourceId: input.emergencyLogId,
    c: input.c
  })

  return { emergencyLog: mapEmergencyLog(data as EmergencyLogRow) }
}

export async function listEmergencyLogs(query: ListEmergencyLogsQuery) {
  const supabaseAdmin = requireSupabaseAdmin()
  const from = (query.page - 1) * query.perPage
  const to = from + query.perPage - 1

  let request = supabaseAdmin
    .from('emergency_logs')
    .select(activeEmergencySelect, { count: 'exact' })
    .order('triggered_at', { ascending: false })
    .range(from, to)

  if (query.status) {
    request = request.eq('status', query.status)
  }

  if (query.userId) {
    request = request.eq('user_id', query.userId)
  }

  const { data, error, count } = await request

  if (error) {
    throw badRequest(error.message)
  }

  return {
    emergencyLogs: ((data ?? []) as unknown as ActiveEmergencyRow[]).map(mapEmergencyLogWithUser),
    page: query.page,
    perPage: query.perPage,
    total: count ?? 0
  }
}

export async function getEmergencyLog(emergencyLogId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('emergency_logs')
    .select(emergencySelect)
    .eq('id', emergencyLogId)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Emergency log was not found')
  }

  return { emergencyLog: mapEmergencyLog(data as EmergencyLogRow) }
}

export async function updateEmergencyLog(input: {
  emergencyLogId: string
  payload: UpdateEmergencyLogRequest
  handledBy: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    status: input.payload.status,
    handled_by: input.handledBy,
    metadata: {
      note: input.payload.note ?? null
    }
  }

  if (input.payload.status === 'ACKNOWLEDGED') {
    updates.acknowledged_at = now
  }

  if (input.payload.status === 'RESOLVED') {
    updates.resolved_at = now
  }

  const { data, error } = await supabaseAdmin
    .from('emergency_logs')
    .update(updates)
    .eq('id', input.emergencyLogId)
    .select(emergencySelect)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Emergency log was not found')
  }

  await writeAuditLog({
    actorUserId: input.handledBy,
    action: 'emergency.update',
    resourceType: 'emergency_log',
    resourceId: input.emergencyLogId,
    metadata: {
      status: input.payload.status,
      note: input.payload.note ?? null
    },
    c: input.c
  })

  return { emergencyLog: mapEmergencyLog(data as EmergencyLogRow) }
}
