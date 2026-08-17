import { randomUUID } from 'node:crypto'
import * as XLSX from 'xlsx'
import { env } from '../../config/env.js'
import { badRequest, notFound } from '../../core/errors/http-error.js'
import { requireSupabaseAdmin } from '../../core/supabase/require-admin-client.js'
import { writeAuditLog } from '../logs/logs.service.js'
import type {
  CreateSalaryUploadUrlRequest,
  ListSalaryRecordsQuery,
  ListSalaryUploadsQuery
} from './salary.schemas.js'
import type { Context } from 'hono'
import type { AppEnv } from '../../types/hono.js'

type SalaryUploadBatchRow = {
  id: string
  uploaded_by: string
  storage_path: string
  original_file_name: string | null
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  total_rows: number
  success_rows: number
  error_rows: number
  errors: unknown[]
  imported_at: string | null
  created_at: string
}

type SalaryRecordRow = {
  id: string
  upload_batch_id: string
  user_id: string
  employee_code: string | null
  employee_email: string | null
  period_month: string
  base_salary: number | string
  allowance: number | string
  deduction: number | string
  net_salary: number | string
  accumulated_salary: number | string
  note: string | null
  created_at: string
}

type ProfileLookupRow = {
  id: string
  email: string | null
  employee_code: string | null
}

type SalaryImportRow = {
  employee_code?: unknown
  employee_email?: unknown
  period_month?: unknown
  base_salary?: unknown
  allowance?: unknown
  deduction?: unknown
  net_salary?: unknown
  accumulated_salary?: unknown
  note?: unknown
}

type SalaryImportError = {
  row: number | null
  column: string | null
  value?: string | null
  message: string
}

const batchSelect =
  'id,uploaded_by,storage_path,original_file_name,status,total_rows,success_rows,error_rows,errors,imported_at,created_at'
const recordSelect =
  'id,upload_batch_id,user_id,employee_code,employee_email,period_month,base_salary,allowance,deduction,net_salary,accumulated_salary,note,created_at'

function mapBatch(row: SalaryUploadBatchRow) {
  return {
    id: row.id,
    uploadedBy: row.uploaded_by,
    storagePath: row.storage_path,
    originalFileName: row.original_file_name,
    status: row.status,
    totalRows: row.total_rows,
    successRows: row.success_rows,
    errorRows: row.error_rows,
    errors: row.errors,
    importedAt: row.imported_at,
    createdAt: row.created_at
  }
}

function mapRecord(row: SalaryRecordRow) {
  return {
    id: row.id,
    uploadBatchId: row.upload_batch_id,
    userId: row.user_id,
    employeeCode: row.employee_code,
    employeeEmail: row.employee_email,
    periodMonth: row.period_month,
    baseSalary: Number(row.base_salary),
    allowance: Number(row.allowance),
    deduction: Number(row.deduction),
    netSalary: Number(row.net_salary),
    accumulatedSalary: Number(row.accumulated_salary),
    note: row.note,
    createdAt: row.created_at
  }
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

function toStringValue(value: unknown) {
  if (value === undefined || value === null) {
    return null
  }

  const stringValue = String(value).trim()
  return stringValue.length > 0 ? stringValue : null
}

function toMoney(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return 0
  }

  const numeric = Number(String(value).replace(/,/g, ''))

  if (!Number.isFinite(numeric) || numeric < 0) {
    return null
  }

  return numeric
}

function formatImportValue(value: unknown) {
  const stringValue = toStringValue(value)
  return stringValue ?? null
}

function parseRequiredMoneyColumn(
  row: SalaryImportRow,
  column: keyof Pick<
    SalaryImportRow,
    'base_salary' | 'allowance' | 'deduction' | 'net_salary' | 'accumulated_salary'
  >,
  rowNumber: number,
  errors: SalaryImportError[]
) {
  const rawValue = row[column]

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    errors.push({
      row: rowNumber,
      column,
      value: null,
      message: `${column} is required and must be a number greater than or equal to 0`
    })
    return null
  }

  const money = toMoney(rawValue)

  if (money === null) {
    errors.push({
      row: rowNumber,
      column,
      value: formatImportValue(rawValue),
      message: `${column} must be a number greater than or equal to 0`
    })
    return null
  }

  return money
}

function parsePeriodMonth(value: unknown) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
  }

  const stringValue = toStringValue(value)

  if (!stringValue || !/^[0-9]{4}-[0-9]{2}$/.test(stringValue)) {
    return null
  }

  return stringValue
}

async function findProfile(input: { employeeCode: string | null; employeeEmail: string | null }) {
  const supabaseAdmin = requireSupabaseAdmin()

  if (!input.employeeCode && !input.employeeEmail) {
    return null
  }

  let request = supabaseAdmin
    .from('profiles')
    .select('id,email,employee_code')
    .limit(1)

  if (input.employeeCode) {
    request = request.eq('employee_code', input.employeeCode)
  } else if (input.employeeEmail) {
    request = request.eq('email', input.employeeEmail)
  }

  request = request.is('deleted_at', null)

  const { data, error } = await request.maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  return data as ProfileLookupRow | null
}

async function getBatch(uploadBatchId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('salary_upload_batches')
    .select(batchSelect)
    .eq('id', uploadBatchId)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Salary upload batch was not found')
  }

  return data as SalaryUploadBatchRow
}

async function getSalaryRecord(salaryRecordId: string) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('salary_records')
    .select(recordSelect)
    .eq('id', salaryRecordId)
    .maybeSingle()

  if (error) {
    throw badRequest(error.message)
  }

  if (!data) {
    throw notFound('Salary record was not found')
  }

  return data as SalaryRecordRow
}

async function updateBatch(uploadBatchId: string, values: Record<string, unknown>) {
  const supabaseAdmin = requireSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('salary_upload_batches')
    .update(values)
    .eq('id', uploadBatchId)
    .select(batchSelect)
    .single()

  if (error || !data) {
    throw badRequest(error?.message ?? 'Unable to update salary upload batch')
  }

  return data as SalaryUploadBatchRow
}

export async function createSalaryUploadUrl(input: {
  payload: CreateSalaryUploadUrlRequest
  uploadedBy: string
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const uploadBatchId = randomUUID()
  const cleanFileName = input.payload.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `salary/${uploadBatchId}/${cleanFileName}`

  const { data: signedUpload, error: signedUploadError } = await supabaseAdmin.storage
    .from(env.SALARY_UPLOAD_BUCKET)
    .createSignedUploadUrl(storagePath)

  if (signedUploadError || !signedUpload) {
    throw badRequest(signedUploadError?.message ?? 'Unable to create salary upload URL')
  }

  const { error } = await supabaseAdmin.from('salary_upload_batches').insert({
    id: uploadBatchId,
    uploaded_by: input.uploadedBy,
    storage_bucket: env.SALARY_UPLOAD_BUCKET,
    storage_path: storagePath,
    original_file_name: input.payload.fileName
  })

  if (error) {
    throw badRequest(error.message)
  }

  return {
    uploadBatchId,
    storagePath,
    signedUploadUrl: signedUpload.signedUrl,
    token: signedUpload.token
  }
}

export async function importSalaryUpload(input: {
  uploadBatchId: string
  importedBy: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const batch = await getBatch(input.uploadBatchId)

  if (batch.status === 'PROCESSING') {
    throw badRequest('Salary upload batch is already processing')
  }

  await updateBatch(input.uploadBatchId, {
    status: 'PROCESSING',
    errors: []
  })

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from(env.SALARY_UPLOAD_BUCKET)
    .download(batch.storage_path)

  if (downloadError || !fileData) {
    const failedBatch = await updateBatch(input.uploadBatchId, {
      status: 'FAILED',
      errors: [{ row: null, message: downloadError?.message ?? 'Unable to download salary file' }]
    })
    return { uploadBatch: mapBatch(failedBatch) }
  }

  const arrayBuffer = await fileData.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true
  })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    const failedBatch = await updateBatch(input.uploadBatchId, {
      status: 'FAILED',
      errors: [{ row: null, message: 'Workbook has no sheets' }]
    })
    return { uploadBatch: mapBatch(failedBatch) }
  }

  const salarySheetName =
    workbook.SheetNames.find((sheetName) => sheetName.trim().toLowerCase() === 'salary_records') ??
    firstSheetName
  const sheet = workbook.Sheets[salarySheetName]

  if (!sheet) {
    const failedBatch = await updateBatch(input.uploadBatchId, {
      status: 'FAILED',
      errors: [{ row: null, message: 'First worksheet was not found' }]
    })
    return { uploadBatch: mapBatch(failedBatch) }
  }

  const rows = XLSX.utils.sheet_to_json<SalaryImportRow>(sheet, {
    defval: null,
    raw: true,
    header: 0
  })
  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
    ) as SalaryImportRow
  )

  if (normalizedRows.length === 0) {
    const failedBatch = await updateBatch(input.uploadBatchId, {
      status: 'FAILED',
      total_rows: 0,
      success_rows: 0,
      error_rows: 1,
      errors: [{ row: null, message: 'No salary rows found in salary_records worksheet' }],
      imported_at: new Date().toISOString()
    })
    return { uploadBatch: mapBatch(failedBatch) }
  }

  const errors: SalaryImportError[] = []
  let successRows = 0

  for (const [index, row] of normalizedRows.entries()) {
    const rowNumber = index + 2
    const rowErrors: SalaryImportError[] = []
    const employeeCode = toStringValue(row.employee_code)
    const employeeEmail = toStringValue(row.employee_email)?.toLowerCase() ?? null
    const profile = await findProfile({ employeeCode, employeeEmail })
    const periodMonth = parsePeriodMonth(row.period_month)
    const baseSalary = parseRequiredMoneyColumn(row, 'base_salary', rowNumber, rowErrors)
    const allowance = parseRequiredMoneyColumn(row, 'allowance', rowNumber, rowErrors)
    const deduction = parseRequiredMoneyColumn(row, 'deduction', rowNumber, rowErrors)
    const netSalary = parseRequiredMoneyColumn(row, 'net_salary', rowNumber, rowErrors)
    const accumulatedSalary = parseRequiredMoneyColumn(
      row,
      'accumulated_salary',
      rowNumber,
      rowErrors
    )

    if (!employeeCode && !employeeEmail) {
      rowErrors.push({
        row: rowNumber,
        column: 'employee_code',
        value: null,
        message: 'employee_code or employee_email is required to find the employee'
      })
    } else if (!profile) {
      if (employeeCode && employeeEmail) {
        rowErrors.push({
          row: rowNumber,
          column: 'employee_code, employee_email',
          value: `${employeeCode}, ${employeeEmail}`,
          message: 'No user profile matches this employee_code or employee_email'
        })
      } else if (employeeCode) {
        rowErrors.push({
          row: rowNumber,
          column: 'employee_code',
          value: employeeCode,
          message: 'Employee code does not match any user profile in the system'
        })
      } else {
        rowErrors.push({
          row: rowNumber,
          column: 'employee_email',
          value: employeeEmail,
          message: 'Employee email does not match any user profile in the system'
        })
      }
    } else if (
      employeeCode &&
      employeeEmail &&
      profile.email?.trim().toLowerCase() !== employeeEmail
    ) {
      rowErrors.push({
        row: rowNumber,
        column: 'employee_code, employee_email',
        value: `${employeeCode}, ${employeeEmail}`,
        message: 'employee_code and employee_email refer to different users'
      })
    }

    if (!periodMonth) {
      rowErrors.push({
        row: rowNumber,
        column: 'period_month',
        value: formatImportValue(row.period_month),
        message: 'period_month is required and must use YYYY-MM format, for example 2026-06'
      })
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      continue
    }

    const { error } = await supabaseAdmin.from('salary_records').upsert(
      {
        upload_batch_id: input.uploadBatchId,
        user_id: profile!.id,
        employee_code: profile!.employee_code,
        employee_email: profile!.email,
        period_month: periodMonth!,
        base_salary: baseSalary,
        allowance,
        deduction,
        net_salary: netSalary,
        accumulated_salary: accumulatedSalary,
        note: toStringValue(row.note)
      },
      { onConflict: 'user_id,period_month' }
    )

    if (error) {
      errors.push({ row: rowNumber, column: null, message: error.message })
      continue
    }

    successRows += 1
  }

  const completedBatch = await updateBatch(input.uploadBatchId, {
    status: errors.length > 0 ? 'FAILED' : 'COMPLETED',
    total_rows: normalizedRows.length,
    success_rows: successRows,
    error_rows: errors.length,
    errors,
    imported_at: new Date().toISOString()
  })

  await writeAuditLog({
    actorUserId: input.importedBy,
    action: 'salary.import',
    resourceType: 'salary_upload_batch',
    resourceId: input.uploadBatchId,
    metadata: {
      totalRows: normalizedRows.length,
      successRows,
      errorRows: errors.length
    },
    c: input.c
  })

  return { uploadBatch: mapBatch(completedBatch) }
}

export async function listSalaryUploads(query: ListSalaryUploadsQuery) {
  const supabaseAdmin = requireSupabaseAdmin()
  const from = (query.page - 1) * query.perPage
  const to = from + query.perPage - 1
  let request = supabaseAdmin
    .from('salary_upload_batches')
    .select(batchSelect, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (query.status) {
    request = request.eq('status', query.status)
  }

  const { data, error, count } = await request

  if (error) {
    throw badRequest(error.message)
  }

  return {
    uploadBatches: ((data ?? []) as SalaryUploadBatchRow[]).map(mapBatch),
    page: query.page,
    perPage: query.perPage,
    total: count ?? 0
  }
}

export async function listSalaryRecords(query: ListSalaryRecordsQuery) {
  const supabaseAdmin = requireSupabaseAdmin()
  const from = (query.page - 1) * query.perPage
  const to = from + query.perPage - 1
  let request = supabaseAdmin
    .from('salary_records')
    .select(recordSelect, { count: 'exact' })
    .order('period_month', { ascending: false })
    .range(from, to)

  if (query.userId) {
    request = request.eq('user_id', query.userId)
  }

  if (query.periodMonth) {
    request = request.eq('period_month', query.periodMonth)
  }

  const { data, error, count } = await request

  if (error) {
    throw badRequest(error.message)
  }

  return {
    salaryRecords: ((data ?? []) as SalaryRecordRow[]).map(mapRecord),
    page: query.page,
    perPage: query.perPage,
    total: count ?? 0
  }
}

export async function deleteSalaryUpload(input: {
  uploadBatchId: string
  deletedBy: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const batch = await getBatch(input.uploadBatchId)

  const { count: salaryRecordCount, error: countError } = await supabaseAdmin
    .from('salary_records')
    .select('id', { count: 'exact', head: true })
    .eq('upload_batch_id', input.uploadBatchId)

  if (countError) {
    throw badRequest(countError.message)
  }

  const { error: deleteError } = await supabaseAdmin
    .from('salary_upload_batches')
    .delete()
    .eq('id', input.uploadBatchId)

  if (deleteError) {
    throw badRequest(deleteError.message)
  }

  const { error: storageError } = await supabaseAdmin.storage
    .from(env.SALARY_UPLOAD_BUCKET)
    .remove([batch.storage_path])

  await writeAuditLog({
    actorUserId: input.deletedBy,
    action: 'salary.upload.delete',
    resourceType: 'salary_upload_batch',
    resourceId: input.uploadBatchId,
    metadata: {
      originalFileName: batch.original_file_name,
      storagePath: batch.storage_path,
      deletedSalaryRecords: salaryRecordCount ?? 0,
      storageDeleted: !storageError,
      storageError: storageError?.message ?? null
    },
    c: input.c
  })

  return {
    deletedUploadBatchId: input.uploadBatchId,
    deletedSalaryRecords: salaryRecordCount ?? 0
  }
}

export async function deleteSalaryRecord(input: {
  salaryRecordId: string
  deletedBy: string
  c?: Context<AppEnv> | undefined
}) {
  const supabaseAdmin = requireSupabaseAdmin()
  const salaryRecord = await getSalaryRecord(input.salaryRecordId)

  const { error } = await supabaseAdmin
    .from('salary_records')
    .delete()
    .eq('id', input.salaryRecordId)

  if (error) {
    throw badRequest(error.message)
  }

  await writeAuditLog({
    actorUserId: input.deletedBy,
    action: 'salary.record.delete',
    resourceType: 'salary_record',
    resourceId: input.salaryRecordId,
    metadata: {
      uploadBatchId: salaryRecord.upload_batch_id,
      userId: salaryRecord.user_id,
      employeeCode: salaryRecord.employee_code,
      employeeEmail: salaryRecord.employee_email,
      periodMonth: salaryRecord.period_month,
      netSalary: Number(salaryRecord.net_salary)
    },
    c: input.c
  })

  return {
    deletedSalaryRecordId: input.salaryRecordId,
    uploadBatchId: salaryRecord.upload_batch_id
  }
}
