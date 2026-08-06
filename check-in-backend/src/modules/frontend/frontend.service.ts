import { badRequest } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { listAttendance } from '../attendance/attendance.service.js'
import { getUserWorkAreas } from '../backoffice/backoffice.service.js'
import { listSalaryRecords } from '../salary/salary.service.js'
import type {
  ListFrontendAttendanceQuery,
  ListFrontendPayslipsQuery
} from './frontend.schemas.js'

export async function listOwnAttendance(input: {
  userId: string
  query: ListFrontendAttendanceQuery
}) {
  return listAttendance({
    page: input.query.page,
    perPage: input.query.perPage,
    userId: input.userId,
    dateFrom: input.query.dateFrom,
    dateTo: input.query.dateTo,
    sortBy: 'workDate',
    sortDirection: 'desc'
  })
}

export async function listOwnPayslips(input: {
  userId: string
  query: ListFrontendPayslipsQuery
}) {
  const { salaryRecords, page, perPage, total } = await listSalaryRecords({
    page: input.query.page,
    perPage: input.query.perPage,
    userId: input.userId,
    periodMonth: input.query.periodMonth
  })

  return {
    payslips: salaryRecords,
    page,
    perPage,
    total
  }
}

/**
 * Returns the caller's active assigned work area (geofence polygon) plus the
 * human-readable work location it belongs to. Staff-readable (own data only) —
 * the underlying area/location records are otherwise admin-scoped.
 */
export async function getOwnWorkAreas(userId: string) {
  const { workAreas } = await getUserWorkAreas(userId)

  if (workAreas.length === 0) {
    return { workAreas: [] }
  }

  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('work_locations')
    .select('id,name,description,area_nodes,is_active,created_at')
    .in(
      'id',
      workAreas.map((workArea) => workArea.workLocationId)
    )
    .eq('is_active', true)

  if (error) {
    throw badRequest(error.message)
  }

  const workLocationsById = new Map(
    (data ?? []).map((location) => [
      location.id as string,
      {
        id: location.id as string,
        name: location.name as string,
        description: (location.description as string | null) ?? null,
        areaNodes: location.area_nodes as Array<{ lat: number; lng: number }>,
        isActive: location.is_active as boolean,
        createdAt: new Date(location.created_at as string).toISOString()
      }
    ])
  )

  return {
    workAreas: workAreas.flatMap((workArea) => {
      const workLocation = workLocationsById.get(workArea.workLocationId)

      return workLocation ? [{ workArea, workLocation }] : []
    })
  }
}
