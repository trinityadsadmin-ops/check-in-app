import { badRequest } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { isPointInsidePolygon, type LatLngNode } from '../attendance/geo.js'

export type ActiveWorkArea = {
  id: string
  user_id: string
  work_location_id: string
  area_nodes: LatLngNode[]
  is_active: boolean
}

/** Returns assignments whose work locations are both assigned and active. */
export async function listActiveWorkAreasForUser(userId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('employee_work_areas')
    .select('id,user_id,work_location_id,area_nodes,is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) {
    throw badRequest(error.message)
  }

  const assignments = (data ?? []) as ActiveWorkArea[]
  const workLocationIds = assignments.map((assignment) => assignment.work_location_id)

  if (workLocationIds.length === 0) {
    return []
  }

  const { data: locations, error: locationsError } = await supabaseAdmin
    .from('work_locations')
    .select('id')
    .in('id', workLocationIds)
    .eq('is_active', true)

  if (locationsError) {
    throw badRequest(locationsError.message)
  }

  const activeLocationIds = new Set((locations ?? []).map((location) => location.id as string))

  return assignments.filter((assignment) => activeLocationIds.has(assignment.work_location_id))
}

/** Finds the employee's assigned active work area that contains a GPS point. */
export async function findActiveWorkAreaForPoint(userId: string, point: LatLngNode) {
  const workAreas = await listActiveWorkAreasForUser(userId)

  return workAreas.find((workArea) => isPointInsidePolygon(point, workArea.area_nodes)) ?? null
}
