import {
  badRequest,
  employeeCodeAlreadyExists,
  forbidden,
  notFound
} from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { getActiveDeviceBinding, resetDeviceBinding } from '../auth/device.service.js'
import { writeAuditLog } from '../logs/logs.service.js'
import type { Context } from 'hono'
import type { AppEnv } from '../../types/hono.js'
import type {
  CreateBackofficeUserRequest,
  CreateWorkLocationRequest,
  LogsQuery,
  ListUsersQuery,
  SetUserPermissionOverridesRequest,
  SetEmployeeWorkAreaRequest,
  UpdateBackofficeUserRequest,
  UpdateWorkLocationRequest
} from './backoffice.schemas.js'

type RoleRow = {
  id: string
  key: string
  name: string
}

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  employee_code: string | null
  role_id?: string
  is_active: boolean
  created_at: string | null
  roles?: RoleRow | RoleRow[] | null
}

type PermissionRow = {
  id: string
  key: string
  name: string
}

type EffectivePermissionSource = 'ROLE' | 'USER_ALLOW' | 'USER_DENY' | 'NONE'

type WorkLocationRow = {
  id: string
  name: string
  description: string | null
  area_nodes: Array<{ lat: number; lng: number }>
  is_active: boolean
  created_at: string
}

type WorkLocationUserRow = {
  user_id: string
  created_at: string
  user?: {
    id: string
    email: string | null
    full_name: string | null
    employee_code: string | null
  } | {
    id: string
    email: string | null
    full_name: string | null
    employee_code: string | null
  }[] | null
}

type EmployeeWorkAreaRow = {
  id: string
  user_id: string
  work_location_id: string
  area_nodes: Array<{ lat: number; lng: number }>
  is_active: boolean
  created_at: string
  updated_at: string
}

type ActorProfileRow = {
  id: string
  full_name: string | null
  employee_code: string | null
}

type AuditLogRow = {
  id: string
  actor_user_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: unknown
  created_at: string
  actor?: ActorProfileRow | ActorProfileRow[] | null
}

type EventLogRow = {
  id: string
  actor_user_id: string | null
  event_type: string
  severity: 'INFO' | 'WARN' | 'ERROR'
  resource_type: string | null
  resource_id: string | null
  metadata: unknown
  created_at: string
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function isDuplicateEmployeeCodeError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const databaseError = error as {
    code?: unknown
    message?: unknown
    details?: unknown
  }

  if (databaseError.code !== '23505') {
    return false
  }

  return [databaseError.message, databaseError.details].some(
    (value) =>
      typeof value === 'string' &&
      (value.includes('profiles_employee_code_key') || value.includes('employee_code'))
  )
}

function profileWriteError(error: unknown) {
  if (isDuplicateEmployeeCodeError(error)) {
    return employeeCodeAlreadyExists()
  }

  return badRequest('Unable to save user profile')
}

function mapRole(row: RoleRow) {
  return {
    id: row.id,
    key: row.key,
    name: row.name
  }
}

function mapUser(row: ProfileRow) {
  const role = first(row.roles)

  if (!role) {
    throw badRequest(`Role is missing for user ${row.id}`)
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    employeeCode: row.employee_code,
    role: mapRole(role),
    isActive: row.is_active,
    createdAt: row.created_at
  }
}

function mapDevice(row: Awaited<ReturnType<typeof getActiveDeviceBinding>>) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    userId: row.user_id,
    deviceUuid: row.device_uuid,
    isActive: row.is_active,
    boundAt: row.bound_at,
    resetAt: row.reset_at
  }
}

function mapWorkLocation(row: WorkLocationRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    areaNodes: row.area_nodes,
    isActive: row.is_active,
    createdAt: row.created_at
  }
}

function mapWorkLocationUser(row: WorkLocationUserRow) {
  const user = first(row.user)

  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    employeeCode: user.employee_code,
    assignedAt: row.created_at
  }
}

function mapWorkArea(row: EmployeeWorkAreaRow) {
  return {
    id: row.id,
    userId: row.user_id,
    workLocationId: row.work_location_id,
    areaNodes: row.area_nodes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapAuditLog(row: AuditLogRow) {
  const actor = first(row.actor)

  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actor: actor
      ? {
          id: actor.id,
          fullName: actor.full_name,
          employeeCode: actor.employee_code
        }
      : null,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    metadata: row.metadata,
    createdAt: row.created_at
  }
}

function mapEventLog(row: EventLogRow) {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    severity: row.severity,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata,
    createdAt: row.created_at
  }
}

async function getUserById(userId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,email,full_name,employee_code,is_active,created_at,roles(id,key,name)')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('User profile was not found')
  }

  return mapUser(data as ProfileRow)
}

export async function listUsers(query: ListUsersQuery) {
  const supabaseAdmin = requireSupabaseAdmin()
  const from = (query.page - 1) * query.perPage
  const to = from + query.perPage - 1

  let request = supabaseAdmin
    .from('profiles')
    .select('id,email,full_name,employee_code,is_active,created_at,roles(id,key,name)', {
      count: 'exact'
    })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (query.search) {
    request = request.or(
      `email.ilike.%${query.search}%,full_name.ilike.%${query.search}%,employee_code.ilike.%${query.search}%`
    )
  }

  const { data, error, count } = await request

  if (error) {
    throw badRequest(error.message)
  }

  return {
    users: ((data ?? []) as ProfileRow[]).map(mapUser),
    page: query.page,
    perPage: query.perPage,
    total: count ?? 0
  }
}

export async function createBackofficeUser(input: {
  payload: CreateBackofficeUserRequest
  actorUserId: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data: role, error: roleError } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('id', input.payload.roleId)
    .maybeSingle()

  if (roleError || !role) {
    throw badRequest(roleError?.message ?? 'Role was not found')
  }

  const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: input.payload.email,
    password: input.payload.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.payload.fullName ?? null
    }
  })

  if (createError || !createdUser.user) {
    throw badRequest(createError?.message ?? 'Unable to create user')
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
    {
      id: createdUser.user.id,
      email: input.payload.email,
      full_name: input.payload.fullName ?? null,
      employee_code: input.payload.employeeCode ?? null,
      role_id: input.payload.roleId,
      is_active: input.payload.isActive
    },
    { onConflict: 'id' }
  )

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id)
    throw profileWriteError(profileError)
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'user.create',
    resourceType: 'profile',
    resourceId: createdUser.user.id,
    metadata: {
      email: input.payload.email,
      roleId: input.payload.roleId
    },
    c: input.c
  })

  return { user: await getUserById(createdUser.user.id) }
}

export async function updateBackofficeUser(input: {
  userId: string
  payload: UpdateBackofficeUserRequest
  actorUserId: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const updates: Record<string, unknown> = {}

  if (input.payload.fullName !== undefined) {
    updates.full_name = input.payload.fullName
  }

  if (input.payload.employeeCode !== undefined) {
    updates.employee_code = input.payload.employeeCode
  }

  if (input.payload.roleId !== undefined) {
    if (input.actorUserId === input.userId) {
      throw forbidden('You cannot change your own role')
    }

    updates.role_id = input.payload.roleId
  }

  if (input.payload.isActive !== undefined) {
    updates.is_active = input.payload.isActive
  }

  if (Object.keys(updates).length === 0) {
    return { user: await getUserById(input.userId) }
  }

  const { error } = await supabaseAdmin.from('profiles').update(updates).eq('id', input.userId)

  if (error) {
    throw profileWriteError(error)
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'user.update',
    resourceType: 'profile',
    resourceId: input.userId,
    metadata: { updates },
    c: input.c
  })

  return { user: await getUserById(input.userId) }
}

export async function getUserPermissionOverrides(userId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('user_permissions')
    .select('effect,permissions(key)')
    .eq('user_id', userId)

  if (error) {
    throw badRequest(error.message)
  }

  return {
    overrides: ((data ?? []) as Array<{
      effect: 'ALLOW' | 'DENY'
      permissions?: { key: string } | { key: string }[] | null
    }>)
      .map((row) => ({
        permissionKey: first(row.permissions)?.key,
        effect: row.effect
      }))
      .filter((row): row is { permissionKey: string; effect: 'ALLOW' | 'DENY' } =>
        Boolean(row.permissionKey)
      )
  }
}

export async function getUserEffectivePermissions(userId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id,email,full_name,employee_code,role_id,is_active,created_at,roles(id,key,name)')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    throw badRequest(profileError.message)
  }

  if (!profile) {
    throw notFound('User profile was not found')
  }

  const user = mapUser(profile as ProfileRow)
  const roleId = (profile as ProfileRow).role_id

  if (!roleId) {
    throw badRequest(`Role is missing for user ${userId}`)
  }

  const [
    { data: allPermissions, error: permissionsError },
    { data: rolePermissions, error: rolePermissionsError },
    { data: userPermissions, error: userPermissionsError }
  ] = await Promise.all([
    supabaseAdmin.from('permissions').select('id,key,name').order('key', { ascending: true }),
    supabaseAdmin.from('role_permissions').select('permission_id').eq('role_id', roleId),
    supabaseAdmin.from('user_permissions').select('permission_id,effect').eq('user_id', userId)
  ])

  if (permissionsError) {
    throw badRequest(permissionsError.message)
  }

  if (rolePermissionsError) {
    throw badRequest(rolePermissionsError.message)
  }

  if (userPermissionsError) {
    throw badRequest(userPermissionsError.message)
  }

  const rolePermissionIds = new Set(
    ((rolePermissions ?? []) as Array<{ permission_id: string }>).map((row) => row.permission_id)
  )
  const overrideEffectByPermissionId = new Map(
    ((userPermissions ?? []) as Array<{ permission_id: string; effect: 'ALLOW' | 'DENY' }>).map(
      (row) => [row.permission_id, row.effect] as const
    )
  )

  return {
    user,
    permissions: ((allPermissions ?? []) as PermissionRow[]).map((permission) => {
      const roleGranted = rolePermissionIds.has(permission.id)
      const overrideEffect = overrideEffectByPermissionId.get(permission.id) ?? null
      const granted = overrideEffect === 'ALLOW' || (roleGranted && overrideEffect !== 'DENY')
      const source: EffectivePermissionSource =
        overrideEffect === 'ALLOW'
          ? 'USER_ALLOW'
          : overrideEffect === 'DENY'
            ? 'USER_DENY'
            : roleGranted
              ? 'ROLE'
              : 'NONE'

      return {
        permission: {
          id: permission.id,
          key: permission.key,
          name: permission.name
        },
        granted,
        roleGranted,
        overrideEffect,
        source
      }
    })
  }
}

export async function setUserPermissionOverrides(input: {
  userId: string
  payload: SetUserPermissionOverridesRequest
  actorUserId: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const permissionKeys = input.payload.overrides.map((override) => override.permissionKey)
  const { data: permissions, error: permissionsError } = await supabaseAdmin
    .from('permissions')
    .select('id,key')
    .in('key', permissionKeys.length > 0 ? permissionKeys : ['__none__'])

  if (permissionsError) {
    throw badRequest(permissionsError.message)
  }

  const permissionIdByKey = new Map(
    ((permissions ?? []) as Array<{ id: string; key: string }>).map((permission) => [
      permission.key,
      permission.id
    ])
  )
  const missingPermission = permissionKeys.find((key) => !permissionIdByKey.has(key))

  if (missingPermission) {
    throw badRequest(`Permission was not found: ${missingPermission}`)
  }

  const { error: deleteError } = await supabaseAdmin
    .from('user_permissions')
    .delete()
    .eq('user_id', input.userId)

  if (deleteError) {
    throw badRequest(deleteError.message)
  }

  if (input.payload.overrides.length > 0) {
    const { error: insertError } = await supabaseAdmin.from('user_permissions').insert(
      input.payload.overrides.map((override) => ({
        user_id: input.userId,
        permission_id: permissionIdByKey.get(override.permissionKey),
        effect: override.effect,
        created_by: input.actorUserId
      }))
    )

    if (insertError) {
      throw badRequest(insertError.message)
    }
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'user_permissions.set',
    resourceType: 'profile',
    resourceId: input.userId,
    metadata: {
      overrides: input.payload.overrides
    },
    c: input.c
  })

  return getUserPermissionOverrides(input.userId)
}

export async function listRoles() {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('roles')
    .select('id,key,name')
    .order('key', { ascending: true })

  if (error) {
    throw badRequest(error.message)
  }

  return { roles: ((data ?? []) as RoleRow[]).map(mapRole) }
}

export async function listPermissions() {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('permissions')
    .select('id,key,name')
    .order('key', { ascending: true })

  if (error) {
    throw badRequest(error.message)
  }

  return {
    permissions: ((data ?? []) as Array<{ id: string; key: string; name: string }>).map(
      (permission) => ({
        id: permission.id,
        key: permission.key,
        name: permission.name
      })
    )
  }
}

export async function getUserDevice(userId: string) {
  return { device: mapDevice(await getActiveDeviceBinding(userId)) }
}

export async function resetUserDevice(input: {
  userId: string
  resetBy: string
  reason?: string | undefined
  c?: Context<AppEnv> | undefined
}) {
  return resetDeviceBinding(input)
}

export async function listWorkLocations() {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('work_locations')
    .select('id,name,description,area_nodes,is_active,created_at')
    .order('name', { ascending: true })

  if (error) {
    throw badRequest(error.message)
  }

  return { workLocations: ((data ?? []) as WorkLocationRow[]).map(mapWorkLocation) }
}

export async function createWorkLocation(input: {
  payload: CreateWorkLocationRequest
  actorUserId: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('work_locations')
    .insert({
      name: input.payload.name,
      description: input.payload.description ?? null,
      area_nodes: input.payload.areaNodes,
      is_active: input.payload.isActive,
      created_by: input.actorUserId
    })
    .select('id,name,description,area_nodes,is_active,created_at')
    .single()

  if (error || !data) {
    throw badRequest(error?.message ?? 'Unable to create work location')
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'work_location.create',
    resourceType: 'work_location',
    resourceId: (data as WorkLocationRow).id,
    metadata: { name: input.payload.name },
    c: input.c
  })

  return { workLocation: mapWorkLocation(data as WorkLocationRow) }
}

export async function updateWorkLocation(input: {
  workLocationId: string
  payload: UpdateWorkLocationRequest
  actorUserId: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const updates: Record<string, unknown> = {}

  if (input.payload.name !== undefined) {
    updates.name = input.payload.name
  }

  if (input.payload.description !== undefined) {
    updates.description = input.payload.description
  }

  if (input.payload.areaNodes !== undefined) {
    updates.area_nodes = input.payload.areaNodes
  }

  if (input.payload.isActive !== undefined) {
    updates.is_active = input.payload.isActive
  }

  const { data, error } = await supabaseAdmin
    .from('work_locations')
    .update(updates)
    .eq('id', input.workLocationId)
    .select('id,name,description,area_nodes,is_active,created_at')
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Work location was not found')
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'work_location.update',
    resourceType: 'work_location',
    resourceId: input.workLocationId,
    metadata: { updates },
    c: input.c
  })

  return { workLocation: mapWorkLocation(data as WorkLocationRow) }
}

export async function getUserWorkArea(userId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('employee_work_areas')
    .select('id,user_id,work_location_id,area_nodes,is_active,created_at,updated_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  return { workArea: data ? mapWorkArea(data as EmployeeWorkAreaRow) : null }
}

export async function listWorkLocationUsers(workLocationId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('employee_work_areas')
    .select(
      'user_id,created_at,user:profiles!employee_work_areas_user_id_fkey(id,email,full_name,employee_code)'
    )
    .eq('work_location_id', workLocationId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) {
    throw badRequest(error.message)
  }

  return {
    users: ((data ?? []) as WorkLocationUserRow[])
      .map(mapWorkLocationUser)
      .filter((user): user is NonNullable<typeof user> => user !== null)
  }
}

export async function setUserWorkArea(input: {
  userId: string
  payload: SetEmployeeWorkAreaRequest
  actorUserId: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data: workLocation, error: workLocationError } = await supabaseAdmin
    .from('work_locations')
    .select('id,name,description,area_nodes,is_active,created_at')
    .eq('id', input.payload.workLocationId)
    .eq('is_active', true)
    .maybeSingle()

  if (workLocationError) {
    throw badRequest(workLocationError.message)
  }

  if (!workLocation) {
    throw notFound('Active work location was not found')
  }

  const existing = await getUserWorkArea(input.userId)

  const values = {
    user_id: input.userId,
    work_location_id: input.payload.workLocationId,
    area_nodes: (workLocation as WorkLocationRow).area_nodes,
    is_active: input.payload.isActive,
    created_by: input.actorUserId
  }

  const request = existing.workArea
    ? supabaseAdmin
        .from('employee_work_areas')
        .update(values)
        .eq('id', existing.workArea.id)
    : supabaseAdmin.from('employee_work_areas').insert(values)

  const { data, error } = await request
    .select('id,user_id,work_location_id,area_nodes,is_active,created_at,updated_at')
    .single()

  if (error || !data) {
    throw badRequest(error?.message ?? 'Unable to set employee work area')
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: existing.workArea ? 'work_area.update' : 'work_area.create',
    resourceType: 'employee_work_area',
    resourceId: (data as EmployeeWorkAreaRow).id,
    metadata: {
      userId: input.userId,
      workLocationId: input.payload.workLocationId
    },
    c: input.c
  })

  return { workArea: mapWorkArea(data as EmployeeWorkAreaRow) }
}

export async function unassignWorkLocationUser(input: {
  workLocationId: string
  userId: string
  actorUserId: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('employee_work_areas')
    .update({ is_active: false })
    .eq('work_location_id', input.workLocationId)
    .eq('user_id', input.userId)
    .eq('is_active', true)
    .select('id')
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Employee assignment was not found')
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'work_location.user_unassign',
    resourceType: 'employee_work_area',
    resourceId: data.id,
    metadata: {
      userId: input.userId,
      workLocationId: input.workLocationId
    },
    c: input.c
  })

  return { unassigned: true }
}

export async function listAuditLogs(query: LogsQuery) {
  const supabaseAdmin = requireSupabaseAdmin()
  const from = (query.page - 1) * query.perPage
  const to = from + query.perPage - 1
  const { data, error, count } = await supabaseAdmin
    .from('audit_logs')
    .select(
      'id,actor_user_id,action,resource_type,resource_id,ip_address,user_agent,metadata,created_at,actor:profiles!audit_logs_actor_user_id_fkey(id,full_name,employee_code)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw badRequest(error.message)
  }

  return {
    auditLogs: ((data ?? []) as AuditLogRow[]).map(mapAuditLog),
    page: query.page,
    perPage: query.perPage,
    total: count ?? 0
  }
}

export async function listEventLogs(query: LogsQuery) {
  const supabaseAdmin = requireSupabaseAdmin()
  const from = (query.page - 1) * query.perPage
  const to = from + query.perPage - 1
  const { data, error, count } = await supabaseAdmin
    .from('event_logs')
    .select('id,actor_user_id,event_type,severity,resource_type,resource_id,metadata,created_at', {
      count: 'exact'
    })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw badRequest(error.message)
  }

  return {
    eventLogs: ((data ?? []) as EventLogRow[]).map(mapEventLog),
    page: query.page,
    perPage: query.perPage,
    total: count ?? 0
  }
}
