import type { Context } from 'hono'
import { badRequest } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import type { AppEnv } from '../../types/hono.js'
import type { ListActionLogsQuery, RecordActionLogsRequest } from './action-logs.schemas.js'
import { uuidPattern } from './action-name.js'

export const actionIdHeader = 'x-action-id'

function requestMetadata(c: Context<AppEnv>) {
  return {
    ip_address: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    user_agent: c.req.header('user-agent') ?? null,
    request_id: c.get('requestId') ?? null
  }
}

function readActionId(c: Context<AppEnv>) {
  const value = c.req.header(actionIdHeader)
  return value && uuidPattern.test(value) ? value : null
}

function errorFromResponse(c: Context<AppEnv>) {
  const error = c.error as { code?: unknown; message?: unknown } | undefined
  return {
    code: typeof error?.code === 'string' ? error.code : c.res.status >= 500 ? 'INTERNAL_SERVER_ERROR' : null,
    message: typeof error?.message === 'string' ? error.message.slice(0, 1000) : null
  }
}

/** Records what the server actually did with a key action (success or failure). */
export async function writeServerActionResult(input: {
  c: Context<AppEnv>
  action: string
  receivedAt: string
}) {
  const { c } = input
  const userId = c.get('currentUser')?.id ?? c.get('actorUserId') ?? null
  const status = c.res.status
  const success = status < 400
  const failure = success ? null : errorFromResponse(c)
  const supabaseAdmin = requireSupabaseAdmin()
  const actionId = readActionId(c) ?? crypto.randomUUID()

  const { error } = await supabaseAdmin.from('action_logs').upsert(
    {
      action_id: actionId,
      user_id: userId,
      action: input.action,
      phase: 'RESULT',
      source: 'SERVER',
      outcome: success ? 'SUCCESS' : 'FAILURE',
      http_status: status,
      error_code: failure?.code ?? null,
      error_message: failure?.message ?? null,
      device_uuid: c.get('deviceUuid') ?? null,
      ...requestMetadata(c),
      metadata: {
        method: c.req.method,
        path: c.req.path,
        receivedAt: input.receivedAt,
        clientActionId: readActionId(c) !== null
      }
    },
    { onConflict: 'action_id,action,phase,source', ignoreDuplicates: true }
  )

  if (error) {
    c.get('logger').warn({ error }, 'Unable to write action log')
  }
}

/** Stores the app's own INTENT/RESULT records (button pressed, what the user saw). */
export async function recordClientActionLogs(input: {
  c: Context<AppEnv>
  userId: string
  payload: RecordActionLogsRequest
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const meta = requestMetadata(input.c)
  const rows = input.payload.logs.map((log) => ({
    action_id: log.actionId,
    user_id: input.userId,
    action: log.action,
    phase: log.phase,
    source: 'CLIENT',
    outcome: log.outcome ?? null,
    error_code: log.errorCode ?? null,
    error_message: log.errorMessage ?? null,
    client_at: log.clientAt,
    device_uuid: input.c.get('deviceUuid') ?? null,
    ...meta,
    metadata: log.metadata ?? {}
  }))

  const { error } = await supabaseAdmin
    .from('action_logs')
    .upsert(rows, { onConflict: 'action_id,action,phase,source', ignoreDuplicates: true })

  if (error) {
    throw badRequest(error.message)
  }

  return { recorded: rows.length }
}

type ActionLogRow = {
  id: string
  action_id: string
  user_id: string | null
  action: string
  phase: 'INTENT' | 'RESULT'
  source: 'CLIENT' | 'SERVER'
  outcome: 'SUCCESS' | 'FAILURE' | null
  http_status: number | null
  error_code: string | null
  error_message: string | null
  client_at: string | null
  created_at: string
  device_uuid: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: unknown
  user:
    | { id: string; full_name: string | null; employee_code: string | null }
    | { id: string; full_name: string | null; employee_code: string | null }[]
    | null
}

function toIso(value: string | null) {
  return value === null ? null : new Date(value).toISOString()
}

export async function listActionLogs(query: ListActionLogsQuery) {
  const supabaseAdmin = requireSupabaseAdmin()
  const from = (query.page - 1) * query.perPage
  const to = from + query.perPage - 1
  let request = supabaseAdmin
    .from('action_logs')
    .select(
      'id,action_id,user_id,action,phase,source,outcome,http_status,error_code,error_message,client_at,created_at,device_uuid,ip_address,user_agent,metadata,user:profiles!action_logs_user_id_fkey(id,full_name,employee_code)',
      { count: 'exact' }
    )

  if (query.userId) request = request.eq('user_id', query.userId)
  if (query.actionId) request = request.eq('action_id', query.actionId)
  if (query.action) request = request.eq('action', query.action)
  if (query.outcome) request = request.eq('outcome', query.outcome)
  if (query.from) request = request.gte('created_at', query.from)
  if (query.to) request = request.lte('created_at', query.to)

  const ascending = query.sortDirection === 'asc'
  const sortColumn = {
    createdAt: 'created_at',
    clientAt: 'client_at',
    employee: 'user(full_name)',
    action: 'action'
  }[query.sortBy]
  request = request.order(sortColumn, { ascending, nullsFirst: false })
  if (query.sortBy !== 'createdAt') {
    request = request.order('created_at', { ascending: false })
  }
  // Stable order across pages when timestamps tie.
  const { data, error, count } = await request.order('id').range(from, to)

  if (error) {
    throw badRequest(error.message)
  }

  return {
    actionLogs: ((data ?? []) as ActionLogRow[]).map((row) => {
      const user = Array.isArray(row.user) ? (row.user[0] ?? null) : row.user
      return {
        id: row.id,
        actionId: row.action_id,
        userId: row.user_id,
        user: user ? { id: user.id, fullName: user.full_name, employeeCode: user.employee_code } : null,
        action: row.action,
        phase: row.phase,
        source: row.source,
        outcome: row.outcome,
        httpStatus: row.http_status,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        clientAt: toIso(row.client_at),
        createdAt: new Date(row.created_at).toISOString(),
        deviceUuid: row.device_uuid,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        metadata: row.metadata
      }
    }),
    page: query.page,
    perPage: query.perPage,
    total: count ?? 0
  }
}
