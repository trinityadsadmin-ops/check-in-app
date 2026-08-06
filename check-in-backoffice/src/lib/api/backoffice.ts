import { fetchJson } from './fetch-json'
import {
  getCreateBackofficeUserUrl,
  getCreateSalaryUploadUrlUrl,
  getCreateWorkLocationUrl,
  getDeleteAreaInspectionAdminUrl,
  getDeleteSalaryRecordUrl,
  getDeleteSalaryUploadUrl,
  getListAreaInspectionsUrl,
  getGetAttendanceDayUrl,
  getGetEmergencyLogUrl,
  getGetUserEffectivePermissionsUrl,
  getGetUserPermissionOverridesUrl,
  getGetUserWorkAreasUrl,
  getImportSalaryUploadUrl,
  getListAttendanceUrl,
  getListAuditLogsUrl,
  getListBackofficeUsersUrl,
  getListEmergencyLogsUrl,
  getListEventLogsUrl,
  getListPermissionsUrl,
  getListRolesUrl,
  getListSalaryRecordsUrl,
  getListSalaryUploadsUrl,
  getListWorkLocationsUrl,
  getListWorkLocationUsersUrl,
  getResetUserDeviceUrl,
  getReviewAttendanceUrl,
  getReviewAreaInspectionUrl,
  getSetUserPermissionOverridesUrl,
  getSetUserWorkAreaUrl,
  getUnassignWorkLocationUserUrl,
  getUpdateBackofficeUserUrl,
  getUpdateEmergencyLogUrl,
  getUpdateWorkLocationUrl
} from '@/generated/api/backoffice/backoffice'
import type {
  AreaInspectionResponse,
  AttendanceDayResponse,
  BackofficeUserResponse,
  DeleteAreaInspectionResponse,
  ListAreaInspectionsParams,
  ListAreaInspectionsResponse,
  CreateBackofficeUserRequest,
  CreateSalaryUploadUrlRequest,
  CreateSalaryUploadUrlResponse,
  CreateWorkLocationRequest,
  DeleteSalaryRecordResponse,
  DeleteSalaryUploadResponse,
  EmergencyLogResponse,
  EmployeeWorkAreasResponse,
  ImportSalaryRequest,
  ImportSalaryResponse,
  ListAuditLogsParams,
  ListAuditLogsResponse,
  ListAttendanceParams,
  ListAttendanceResponse,
  ListBackofficeUsersParams,
  ListEventLogsParams,
  ListEventLogsResponse,
  ListEmergencyLogsParams,
  ListEmergencyLogsResponse,
  ListSalaryRecordsParams,
  ListSalaryRecordsResponse,
  ListSalaryUploadsParams,
  ListSalaryUploadsResponse,
  ListPermissionsResponse,
  ListRolesResponse,
  ListUsersResponse,
  ListWorkLocationsResponse,
  ResetDeviceResponse,
  ReviewAttendanceRequest,
  ReviewAreaInspectionRequest,
  SetUserPermissionOverridesRequest,
  SetEmployeeWorkAreaRequest,
  UpdateEmergencyLogRequest,
  UpdateBackofficeUserRequest,
  UpdateWorkLocationRequest,
  UnassignWorkLocationUserResponse,
  UserPermissionOverridesResponse,
  UserEffectivePermissionsResponse,
  WorkLocationResponse,
  WorkLocationUsersResponse
} from '@/generated/api/model'

export function listUsers(params: ListBackofficeUsersParams = {}) {
  return fetchJson<ListUsersResponse>(getListBackofficeUsersUrl(params))
}

export function listRoles() {
  return fetchJson<ListRolesResponse>(getListRolesUrl())
}

export function listPermissions() {
  return fetchJson<ListPermissionsResponse>(getListPermissionsUrl())
}

export function createUser(payload: CreateBackofficeUserRequest) {
  return fetchJson<BackofficeUserResponse>(getCreateBackofficeUserUrl(), {
    method: 'POST',
    body: payload
  })
}

export function updateUser(userId: string, payload: UpdateBackofficeUserRequest) {
  return fetchJson<BackofficeUserResponse>(getUpdateBackofficeUserUrl(userId), {
    method: 'PATCH',
    body: payload
  })
}

export function resetUserDevice(userId: string, reason?: string) {
  return fetchJson<ResetDeviceResponse>(getResetUserDeviceUrl(userId), {
    method: 'POST',
    body: reason ? { reason } : {}
  })
}

export function getUserPermissionOverrides(userId: string) {
  return fetchJson<UserPermissionOverridesResponse>(getGetUserPermissionOverridesUrl(userId))
}

export function getUserEffectivePermissions(userId: string) {
  return fetchJson<UserEffectivePermissionsResponse>(getGetUserEffectivePermissionsUrl(userId))
}

export function setUserPermissionOverrides(
  userId: string,
  payload: SetUserPermissionOverridesRequest
) {
  return fetchJson<UserPermissionOverridesResponse>(getSetUserPermissionOverridesUrl(userId), {
    method: 'PUT',
    body: payload
  })
}

export function listWorkLocations() {
  return fetchJson<ListWorkLocationsResponse>(getListWorkLocationsUrl())
}

export function createWorkLocation(payload: CreateWorkLocationRequest) {
  return fetchJson<WorkLocationResponse>(getCreateWorkLocationUrl(), {
    method: 'POST',
    body: payload
  })
}

export function updateWorkLocation(workLocationId: string, payload: UpdateWorkLocationRequest) {
  return fetchJson<WorkLocationResponse>(getUpdateWorkLocationUrl(workLocationId), {
    method: 'PATCH',
    body: payload
  })
}

export function listWorkLocationUsers(workLocationId: string) {
  return fetchJson<WorkLocationUsersResponse>(getListWorkLocationUsersUrl(workLocationId))
}

export function unassignWorkLocationUser(workLocationId: string, userId: string) {
  return fetchJson<UnassignWorkLocationUserResponse>(
    getUnassignWorkLocationUserUrl(workLocationId, userId),
    { method: 'DELETE' }
  )
}

export function getUserWorkAreas(userId: string) {
  return fetchJson<EmployeeWorkAreasResponse>(getGetUserWorkAreasUrl(userId))
}

export function setUserWorkArea(userId: string, payload: SetEmployeeWorkAreaRequest) {
  return fetchJson<EmployeeWorkAreasResponse>(getSetUserWorkAreaUrl(userId), {
    method: 'PUT',
    body: payload
  })
}

export function listAttendance(params: ListAttendanceParams = {}) {
  return fetchJson<ListAttendanceResponse>(getListAttendanceUrl(params))
}

export function getAttendanceDay(attendanceDayId: string) {
  return fetchJson<AttendanceDayResponse>(getGetAttendanceDayUrl(attendanceDayId))
}

export function reviewAttendance(attendanceDayId: string, payload: ReviewAttendanceRequest) {
  return fetchJson<AttendanceDayResponse>(getReviewAttendanceUrl(attendanceDayId), {
    method: 'PATCH',
    body: payload
  })
}

export function listAreaInspections(params: ListAreaInspectionsParams = {}) {
  return fetchJson<ListAreaInspectionsResponse>(getListAreaInspectionsUrl(params))
}

export function deleteAreaInspection(areaInspectionId: string) {
  return fetchJson<DeleteAreaInspectionResponse>(
    getDeleteAreaInspectionAdminUrl(areaInspectionId),
    {
      method: 'DELETE'
    }
  )
}

export function reviewAreaInspection(
  areaInspectionId: string,
  payload: ReviewAreaInspectionRequest
) {
  return fetchJson<AreaInspectionResponse>(getReviewAreaInspectionUrl(areaInspectionId), {
    method: 'PATCH',
    body: payload
  })
}

export function listEmergencyLogs(params: ListEmergencyLogsParams = {}) {
  return fetchJson<ListEmergencyLogsResponse>(getListEmergencyLogsUrl(params))
}

export function getEmergencyLog(emergencyLogId: string) {
  return fetchJson<EmergencyLogResponse>(getGetEmergencyLogUrl(emergencyLogId))
}

export function updateEmergencyLog(emergencyLogId: string, payload: UpdateEmergencyLogRequest) {
  return fetchJson<EmergencyLogResponse>(getUpdateEmergencyLogUrl(emergencyLogId), {
    method: 'PATCH',
    body: payload
  })
}

export function createSalaryUploadUrl(payload: CreateSalaryUploadUrlRequest) {
  return fetchJson<CreateSalaryUploadUrlResponse>(getCreateSalaryUploadUrlUrl(), {
    method: 'POST',
    body: payload
  })
}

export function importSalaryUpload(payload: ImportSalaryRequest) {
  return fetchJson<ImportSalaryResponse>(getImportSalaryUploadUrl(), {
    method: 'POST',
    body: payload
  })
}

export function listSalaryUploads(params: ListSalaryUploadsParams = {}) {
  return fetchJson<ListSalaryUploadsResponse>(getListSalaryUploadsUrl(params))
}

export function listSalaryRecords(params: ListSalaryRecordsParams = {}) {
  return fetchJson<ListSalaryRecordsResponse>(getListSalaryRecordsUrl(params))
}

export function deleteSalaryUpload(uploadBatchId: string) {
  return fetchJson<DeleteSalaryUploadResponse>(getDeleteSalaryUploadUrl(uploadBatchId), {
    method: 'DELETE'
  })
}

export function deleteSalaryRecord(salaryRecordId: string) {
  return fetchJson<DeleteSalaryRecordResponse>(getDeleteSalaryRecordUrl(salaryRecordId), {
    method: 'DELETE'
  })
}

export function listAuditLogs(params: ListAuditLogsParams = {}) {
  return fetchJson<ListAuditLogsResponse>(getListAuditLogsUrl(params))
}

export function listEventLogs(params: ListEventLogsParams = {}) {
  return fetchJson<ListEventLogsResponse>(getListEventLogsUrl(params))
}
