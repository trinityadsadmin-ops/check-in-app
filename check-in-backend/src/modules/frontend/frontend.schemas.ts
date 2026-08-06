import { z } from '@hono/zod-openapi'
import { UserSchema } from '../../shared/schemas/common.js'
import { AttendanceDaySchema } from '../attendance/attendance.schemas.js'
import {
  EmployeeWorkAreaSchema,
  WorkLocationSchema
} from '../backoffice/backoffice.schemas.js'
import { SalaryRecordSchema } from '../salary/salary.schemas.js'

export const FrontendProfileResponseSchema = z
  .object({
    user: UserSchema
  })
  .openapi('FrontendProfileResponse')

export const ListFrontendAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional()
})

export const ListFrontendAttendanceResponseSchema = z
  .object({
    attendanceDays: z.array(AttendanceDaySchema),
    page: z.number(),
    perPage: z.number(),
    total: z.number()
  })
  .openapi('ListFrontendAttendanceResponse')

export const ListFrontendPayslipsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
  periodMonth: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}$/)
    .optional()
})

export const ListFrontendPayslipsResponseSchema = z
  .object({
    payslips: z.array(SalaryRecordSchema),
    page: z.number(),
    perPage: z.number(),
    total: z.number()
  })
  .openapi('ListFrontendPayslipsResponse')

export const FrontendWorkAreaAssignmentSchema = z
  .object({
    workArea: z.object(EmployeeWorkAreaSchema.shape),
    workLocation: z.object(WorkLocationSchema.shape)
  })
  .openapi('FrontendWorkAreaAssignment')

export const FrontendWorkAreasResponseSchema = z
  .object({
    workAreas: z.array(FrontendWorkAreaAssignmentSchema)
  })
  .openapi('FrontendWorkAreasResponse')

export type ListFrontendAttendanceQuery = z.infer<typeof ListFrontendAttendanceQuerySchema>
export type ListFrontendPayslipsQuery = z.infer<typeof ListFrontendPayslipsQuerySchema>

export const CreateCheckInRequestSchema = z
  .object({
    locationId: z.string().uuid(),
    note: z.string().max(500).optional()
  })
  .openapi('CreateCheckInRequest')

export const CreateCheckInResponseSchema = z
  .object({
    id: z.string().uuid(),
    locationId: z.string().uuid(),
    userId: z.string().uuid(),
    checkedInAt: z.string().datetime(),
    note: z.string().nullable()
  })
  .openapi('CreateCheckInResponse')
