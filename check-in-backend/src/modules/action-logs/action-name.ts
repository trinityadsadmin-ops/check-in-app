export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const namedActions: Record<string, string> = {
  'POST /auth/sign-in': 'auth.sign_in',
  'POST /auth/sign-out': 'auth.sign_out',
  'POST /mobile/attendance/upload-url': 'attendance.photo_upload_url',
  'POST /mobile/attendance/check-in': 'attendance.check_in',
  'POST /mobile/attendance/check-out': 'attendance.check_out',
  'POST /mobile/area-inspections/upload-url': 'area_inspection.photo_upload_url',
  'POST /mobile/area-inspections': 'area_inspection.create',
  'DELETE /mobile/area-inspections/:id': 'area_inspection.delete',
  'POST /mobile/emergency': 'emergency.create',
  'POST /mobile/emergency/:id/cancel': 'emergency.cancel',
  'POST /frontend/check-ins': 'frontend.check_in'
}

/**
 * Maps a request to the action it performs, or `null` when it is not an
 * employee action worth recording (reads, backoffice, internal, the log
 * ingestion endpoint itself).
 */
export function resolveActionName(method: string, path: string, basePath: string) {
  const upper = method.toUpperCase()
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') {
    return null
  }
  const relative = path.startsWith(basePath) ? path.slice(basePath.length) : path
  const normalized = relative
    .split('/')
    .map((segment) => (uuidPattern.test(segment) ? ':id' : segment))
    .join('/')
    .replace(/\/+$/, '')

  if (normalized === '/mobile/action-logs') {
    return null
  }
  const key = `${upper} ${normalized}`
  if (namedActions[key]) {
    return namedActions[key]
  }
  if (normalized.startsWith('/mobile/') || normalized.startsWith('/frontend/')) {
    return key
  }
  return null
}
