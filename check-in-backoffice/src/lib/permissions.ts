export const permissions = {
  usersRead: 'users:read',
  usersCreate: 'users:create',
  usersUpdate: 'users:update',
  usersResetDevice: 'users:reset_device',
  rolesRead: 'roles:read',
  rolesAssign: 'roles:assign',
  permissionsRead: 'permissions:read',
  permissionsUpdate: 'permissions:update',
  workAreasRead: 'work_areas:read',
  workAreasManage: 'work_areas:manage',
  attendanceRead: 'attendance:read',
  attendanceReview: 'attendance:review',
  areaInspectionsRead: 'area_inspections:read',
  areaInspectionsReview: 'area_inspections:review',
  areaInspectionsDelete: 'area_inspections:delete',
  salaryRead: 'salary:read',
  salaryUpload: 'salary:upload',
  salaryDelete: 'salary:delete',
  logsRead: 'logs:read',
  emergencyRead: 'emergency:read',
  emergencyUpdate: 'emergency:update'
} as const

type PermissionUser = {
  permissions?: string[]
}

export function hasPermission(user: PermissionUser | null | undefined, permission: string) {
  return Boolean(user?.permissions?.includes(permission))
}

export function hasEveryPermission(
  user: PermissionUser | null | undefined,
  requiredPermissions: string[]
) {
  return requiredPermissions.every((permission) => hasPermission(user, permission))
}
