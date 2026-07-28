import { badRequest } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { listAttendance } from '../attendance/attendance.service.js'
import { getUserWorkArea } from '../backoffice/backoffice.service.js'
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
    dateTo: input.query.dateTo
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
export async function getOwnWorkArea(userId: string) {
  const { workArea } = await getUserWorkArea(userId)

  if (!workArea) {
    return { workArea: null, workLocation: null }
  }

  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('work_locations')
    .select('id,name,description,area_nodes,is_active,created_at')
    .eq('id', workArea.workLocationId)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  return {
    workArea,
    workLocation: data
      ? {
          id: data.id as string,
          name: data.name as string,
          description: (data.description as string | null) ?? null,
          areaNodes: data.area_nodes as Array<{ lat: number; lng: number }>,
          isActive: data.is_active as boolean,
          createdAt: new Date(data.created_at as string).toISOString()
        }
      : null
  }
}
