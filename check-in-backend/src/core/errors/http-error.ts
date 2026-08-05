export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EMPLOYEE_CODE_ALREADY_EXISTS'
  | 'USER_ALREADY_ASSIGNED_TO_WORK_LOCATION'
  | 'AREA_INSPECTION_REVIEW_NOTE_REQUIRED'
  | 'RATE_LIMITED'
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

export const userAlreadyAssignedToWorkLocation = (workLocationId: string) =>
  new AppError(
    409,
    'USER_ALREADY_ASSIGNED_TO_WORK_LOCATION',
    'User is already assigned to another work location',
    { workLocationId }
  )

export const areaInspectionReviewNoteRequired = () =>
  new AppError(
    400,
    'AREA_INSPECTION_REVIEW_NOTE_REQUIRED',
    'A review note is required when rejecting an area inspection'
  )

export const rateLimited = (message = 'Too many requests') =>
  new AppError(429, 'RATE_LIMITED', message)
