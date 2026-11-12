import type { AttendanceEventType } from './attendance.schemas.js'

/**
 * Shifts never cross midnight (Asia/Bangkok), so a past day whose last event
 * is a CHECK_IN can no longer be closed: the employee forgot to check out.
 * Today's open check-in is just "currently working".
 */
export function isMissingCheckOut(
  workDate: string,
  lastEventType: AttendanceEventType | null,
  today: string
) {
  return lastEventType === 'CHECK_IN' && workDate < today
}
