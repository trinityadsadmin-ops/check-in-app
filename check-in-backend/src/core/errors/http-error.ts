export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EMPLOYEE_CODE_ALREADY_EXISTS'
  | 'EMAIL_ALREADY_EXISTS'
  | 'AREA_INSPECTION_REVIEW_NOTE_REQUIRED'
  | 'RATE_LIMITED'
  | 'DEVICE_NOT_BOUND'
  | 'DEVICE_MISMATCH'
  | 'DEVICE_LOCKED'
  | 'DEVICE_SIGNATURE_REQUIRED'
  | 'DEVICE_KEY_REQUIRED'
  | 'DEVICE_COUNTER_REUSED'
  | 'MISSING_CHECK_OUT'
  | 'INTERNAL_SERVER_ERROR'

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details)

export const unauthorized = (message = 'Authentication is required') =>
  new AppError(401, 'UNAUTHORIZED', message)

export const forbidden = (message = 'Permission denied') =>
  new AppError(403, 'FORBIDDEN', message)

export const notFound = (message = 'Resource not found') =>
  new AppError(404, 'NOT_FOUND', message)

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details)

export const employeeCodeAlreadyExists = () =>
  new AppError(409, 'EMPLOYEE_CODE_ALREADY_EXISTS', 'Employee code already exists')

export const emailAlreadyExists = () =>
  new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists')

export const areaInspectionReviewNoteRequired = () =>
  new AppError(
    400,
    'AREA_INSPECTION_REVIEW_NOTE_REQUIRED',
    'A review note is required when rejecting an area inspection'
  )

export const rateLimited = (message = 'Too many requests') =>
  new AppError(429, 'RATE_LIMITED', message)

export const deviceError = (
  code: Extract<
    ErrorCode,
    | 'DEVICE_NOT_BOUND'
    | 'DEVICE_MISMATCH'
    | 'DEVICE_LOCKED'
    | 'DEVICE_SIGNATURE_REQUIRED'
    | 'DEVICE_KEY_REQUIRED'
  >,
  message: string
) => new AppError(403, code, message)

/**
 * The request reused a device counter. Usually the browser re-sent a request on
 * a flaky connection, so this is not a lock: the app signs again and retries.
 * 409 (not 403) so the app does not treat it as a blocked device.
 */
export const deviceCounterReused = () =>
  new AppError(409, 'DEVICE_COUNTER_REUSED', 'This request was already received. Please try again.')

export const missingCheckOut = (workDate: string) =>
  new AppError(
    400,
    'MISSING_CHECK_OUT',
    `Your check-in on ${workDate} was never checked out and has been flagged for review. Please contact your supervisor.`,
    { workDate }
  )
