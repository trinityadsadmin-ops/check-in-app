'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Download, Info, Trash2, Upload } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorBanner } from '@/components/data/error-banner'
import { TableSkeleton } from '@/components/data/table-skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  createSalaryUploadUrl,
  deleteSalaryRecord,
  deleteSalaryUpload,
  importSalaryUpload,
  listSalaryRecords,
  listSalaryUploads
} from '@/lib/api/backoffice'
import { getErrorMessage } from '@/lib/api/errors'
import { usePermissions } from '@/hooks/use-permissions'
import { translateStatusKey, useI18n } from '@/lib/i18n'
import type { SalaryRecord, SalaryUploadBatch } from '@/generated/api/model'

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2
  }).format(value)
}

function normalizeSalaryContentType(file: File) {
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  ) {
    return file.type
  }

  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

const salaryTemplateColumns = [
  'employee_code',
  'employee_email',
  'period_month',
  'base_salary',
  'allowance',
  'deduction',
  'net_salary',
  'accumulated_salary',
  'note'
] as const

const salaryTemplateSample = {
  employee_code: 'EMP001',
  employee_email: 'employee@example.com',
  period_month: '2026-06',
  base_salary: '30000',
  allowance: '2500',
  deduction: '500',
  net_salary: '32000',
  accumulated_salary: '192000',
  note: 'June salary'
}

function getImportErrorLabels(t: (key: string) => string) {
  return {
    row: t('salary.row'),
    column: t('salary.column'),
    value: t('salary.value'),
    fallback: t('salary.importErrors')
  }
}

function formatBatchError(
  error: unknown,
  labels: { row: string; column: string; value: string; fallback: string }
) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const row =
      'row' in error && (typeof error.row === 'number' || error.row === null)
        ? error.row
        : null
    const column =
      'column' in error && typeof error.column === 'string' && error.column.length > 0
        ? error.column
        : null
    const value =
      'value' in error &&
      (typeof error.value === 'string' || typeof error.value === 'number')
        ? String(error.value)
        : null
    const message =
      typeof error.message === 'string' && error.message.length > 0
        ? error.message
        : labels.fallback
    const parts = [
      row ? `${labels.row} ${row}` : null,
      column ? `${labels.column} ${column}` : null,
      value ? `${labels.value} ${value}` : null
    ].filter(Boolean)

    return parts.length > 0 ? `${parts.join(' · ')}: ${message}` : message
  }

  return typeof error === 'string' && error.length > 0 ? error : labels.fallback
}

function isEmptyCompletedSalaryBatch(batch: { status: string; totalRows: number }) {
  return batch.status === 'COMPLETED' && batch.totalRows === 0
}

async function downloadSalaryTemplate(t: (key: string) => string) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const recordsSheet = XLSX.utils.aoa_to_sheet([[...salaryTemplateColumns]])
  recordsSheet['!cols'] = salaryTemplateColumns.map(() => ({ wch: 22 }))

  const guideRows = [
    [
      t('salary.fieldName'),
      t('salary.fieldRequirement'),
      t('common.description'),
      t('salary.fieldExample')
    ],
    ...salaryTemplateColumns.map((column) => [
      column,
      t(`salary.template.${column}.requirement`),
      t(`salary.template.${column}.description`),
      salaryTemplateSample[column]
    ])
  ]
  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows)
  guideSheet['!cols'] = [{ wch: 24 }, { wch: 30 }, { wch: 72 }, { wch: 24 }]

  XLSX.utils.book_append_sheet(workbook, recordsSheet, 'salary_records')
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'field_guide')

  const workbookData = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array'
  })
  const blob = new Blob([workbookData], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'salary-import-template.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function uploadToSupabaseSignedUrl(input: {
  signedUploadUrl: string
  file: File
  uploadFailedMessage: string
}) {
  const body = new FormData()
  body.append('cacheControl', '3600')
  body.append('', input.file)

  const response = await fetch(input.signedUploadUrl, {
    method: 'PUT',
    headers: {
      'x-upsert': 'false'
    },
    body
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || input.uploadFailedMessage)
  }
}

export function SalaryPage() {
  const queryClient = useQueryClient()
  const { locale, t } = useI18n()
  const { has, permissions } = usePermissions()
  const canUploadSalary = has(permissions.salaryUpload)
  const canDeleteSalary = has(permissions.salaryDelete)
  const [file, setFile] = useState<File | null>(null)
  const [isTemplateGuideOpen, setIsTemplateGuideOpen] = useState(false)
  const [selectedErrorBatch, setSelectedErrorBatch] = useState<SalaryUploadBatch | null>(null)
  const [deleteTargetBatch, setDeleteTargetBatch] = useState<SalaryUploadBatch | null>(null)
  const [deleteTargetRecord, setDeleteTargetRecord] = useState<SalaryRecord | null>(null)
  const uploadBatchesQuery = useQuery({
    queryKey: ['salary-uploads'],
    queryFn: () => listSalaryUploads({ page: 1, perPage: 20 })
  })
  const salaryRecordsQuery = useQuery({
    queryKey: ['salary-records'],
    queryFn: () => listSalaryRecords({ page: 1, perPage: 20 })
  })
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error(t('salary.chooseExcel'))
      }

      const contentType = normalizeSalaryContentType(file)
      const upload = await createSalaryUploadUrl({
        fileName: file.name,
        contentType
      })

      await uploadToSupabaseSignedUrl({
        signedUploadUrl: upload.signedUploadUrl,
        file,
        uploadFailedMessage: t('salary.uploadFailed')
      })

      return importSalaryUpload({ uploadBatchId: upload.uploadBatchId })
    },
    onSuccess: (response) => {
      setFile(null)
      queryClient.invalidateQueries({ queryKey: ['salary-uploads'] })
      queryClient.invalidateQueries({ queryKey: ['salary-records'] })

      if (isEmptyCompletedSalaryBatch(response.uploadBatch)) {
        toast.error(t('salary.toastImportNoRows'), {
          description: t('salary.noRowsDescription')
        })
        return
      }

      if (response.uploadBatch.status === 'FAILED') {
        toast.error(t('salary.toastImportFailed'), {
          description:
            response.uploadBatch.errors.length > 0
              ? formatBatchError(response.uploadBatch.errors[0], getImportErrorLabels(t))
              : t('salary.toastImportFailed')
        })
        return
      }

      toast.success(t('salary.toastUploaded'))
    },
    onError: (error) =>
      toast.error(t('toast.actionFailed'), {
        description: getErrorMessage(error)
      })
  })
  const deleteUploadMutation = useMutation({
    mutationFn: (batch: SalaryUploadBatch) => deleteSalaryUpload(batch.id),
    onSuccess: (response) => {
      if (selectedErrorBatch?.id === response.deletedUploadBatchId) {
        setSelectedErrorBatch(null)
      }

      setDeleteTargetBatch(null)
      queryClient.invalidateQueries({ queryKey: ['salary-uploads'] })
      queryClient.invalidateQueries({ queryKey: ['salary-records'] })
      toast.success(t('salary.toastDeleted'), {
        description: `${t('salary.deletedRecords')}: ${response.deletedSalaryRecords}`
      })
    },
    onError: (error) =>
      toast.error(t('toast.actionFailed'), {
        description: getErrorMessage(error)
      })
  })
  const deleteRecordMutation = useMutation({
    mutationFn: (record: SalaryRecord) => deleteSalaryRecord(record.id),
    onSuccess: () => {
      setDeleteTargetRecord(null)
      queryClient.invalidateQueries({ queryKey: ['salary-records'] })
      toast.success(t('salary.toastRecordDeleted'))
    },
    onError: (error) =>
      toast.error(t('toast.actionFailed'), {
        description: getErrorMessage(error)
      })
  })

  const batches = uploadBatchesQuery.data?.uploadBatches ?? []
  const records = salaryRecordsQuery.data?.salaryRecords ?? []
  const selectedErrorBatchIsEmpty = selectedErrorBatch
    ? isEmptyCompletedSalaryBatch(selectedErrorBatch)
    : false

  return (
    <div className="grid gap-6">
      {canUploadSalary ? (
      <Card>
          <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>{t('salary.importTitle')}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                aria-expanded={isTemplateGuideOpen}
                aria-controls="salary-template-guide"
                onClick={() => setIsTemplateGuideOpen((current) => !current)}
              >
                <Info className="size-4" />
                {isTemplateGuideOpen ? t('salary.hideTemplateGuide') : t('salary.showTemplateGuide')}
                {isTemplateGuideOpen ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void downloadSalaryTemplate(t)}
              >
                <Download className="size-4" />
                {t('salary.downloadTemplate')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form
            className="grid gap-3 md:grid-cols-[1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault()
              uploadMutation.mutate()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="salary-file">{t('salary.excelFile')}</Label>
              <Input
                id="salary-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={!file || uploadMutation.isPending}>
                <Upload className="size-4" />
                {t('salary.upload')}
              </Button>
            </div>
          </form>
          {uploadMutation.isError ? <ErrorBanner error={uploadMutation.error} /> : null}
          {isTemplateGuideOpen ? (
          <div id="salary-template-guide" className="grid gap-3 rounded-md border p-4">
            <div className="grid gap-1">
              <div className="text-sm font-medium">{t('salary.templateGuideTitle')}</div>
              <div className="text-sm text-muted-foreground">
                {t('salary.templateGuideDescription')}
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('salary.fieldName')}</TableHead>
                  <TableHead>{t('salary.fieldRequirement')}</TableHead>
                  <TableHead>{t('common.description')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salaryTemplateColumns.map((column) => (
                  <TableRow key={column}>
                    <TableCell className="font-mono text-xs">{column}</TableCell>
                    <TableCell>{t(`salary.template.${column}.requirement`)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t(`salary.template.${column}.description`)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('salary.uploadBatches')}</CardTitle>
        </CardHeader>
        <CardContent>
          {uploadBatchesQuery.isLoading ? <TableSkeleton rows={3} /> : null}
          {uploadBatchesQuery.isError ? <ErrorBanner error={uploadBatchesQuery.error} /> : null}
          {uploadBatchesQuery.data ? (
            batches.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.created')}</TableHead>
                    <TableHead>{t('common.file')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-right">{t('common.rows')}</TableHead>
                    <TableHead className="text-right">{t('common.errors')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => {
                    const isEmptyCompletedBatch = isEmptyCompletedSalaryBatch(batch)

                    return (
                    <Fragment key={batch.id}>
                    <TableRow>
                      <TableCell>{new Date(batch.createdAt).toLocaleString(locale)}</TableCell>
                      <TableCell className="font-medium">
                        {batch.originalFileName ?? batch.storagePath}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            batch.status === 'FAILED' || isEmptyCompletedBatch
                              ? 'destructive'
                              : 'outline'
                          }
                        >
                          {isEmptyCompletedBatch
                            ? t('salary.noRowsStatus')
                            : t(translateStatusKey(batch.status))}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {batch.successRows}/{batch.totalRows}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span>{isEmptyCompletedBatch ? 1 : batch.errorRows}</span>
                          {batch.errors.length > 0 || isEmptyCompletedBatch ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedErrorBatch(batch)}
                            >
                              {t('salary.viewErrors')}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {canDeleteSalary ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={deleteUploadMutation.isPending}
                            onClick={() => setDeleteTargetBatch(batch)}
                          >
                            <Trash2 className="size-4" />
                            {t('common.remove')}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                    </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState label={t('salary.emptyUploads')} />
            )
          ) : null}
        </CardContent>
      </Card>

      <Sheet
        open={Boolean(selectedErrorBatch)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedErrorBatch(null)
          }
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t('salary.importErrors')}</SheetTitle>
            <SheetDescription>
              {selectedErrorBatch?.originalFileName ?? selectedErrorBatch?.storagePath ?? ''}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 grid gap-3">
            {selectedErrorBatchIsEmpty ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {t('salary.noRowsDescription')}
              </div>
            ) : null}
            {selectedErrorBatch?.errors.map((error, index) => (
              <div key={index} className="rounded-md border p-3 text-sm">
                {formatBatchError(error, getImportErrorLabels(t))}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(deleteTargetBatch)}
        onOpenChange={(open) => {
          if (!open && !deleteUploadMutation.isPending) {
            setDeleteTargetBatch(null)
          }
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('salary.deleteUploadTitle')}</SheetTitle>
            <SheetDescription>{t('salary.deleteUploadDescription')}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 grid gap-3 rounded-md border p-4 text-sm">
            <div className="grid gap-1">
              <div className="text-muted-foreground">{t('common.file')}</div>
              <div className="font-medium">
                {deleteTargetBatch?.originalFileName ?? deleteTargetBatch?.storagePath ?? '-'}
              </div>
            </div>
            <div className="grid gap-1">
              <div className="text-muted-foreground">{t('salary.deletedRecords')}</div>
              <div className="font-medium">{deleteTargetBatch?.successRows ?? 0}</div>
            </div>
          </div>
          <SheetFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={deleteUploadMutation.isPending}
              onClick={() => setDeleteTargetBatch(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTargetBatch || deleteUploadMutation.isPending}
              onClick={() => {
                if (deleteTargetBatch) {
                  deleteUploadMutation.mutate(deleteTargetBatch)
                }
              }}
            >
              <Trash2 className="size-4" />
              {t('salary.confirmDeleteUpload')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Card>
        <CardHeader>
          <CardTitle>{t('salary.records')}</CardTitle>
        </CardHeader>
        <CardContent>
          {salaryRecordsQuery.isLoading ? <TableSkeleton rows={3} /> : null}
          {salaryRecordsQuery.isError ? <ErrorBanner error={salaryRecordsQuery.error} /> : null}
          {salaryRecordsQuery.data ? (
            records.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.period')}</TableHead>
                    <TableHead>{t('common.employee')}</TableHead>
                    <TableHead className="text-right">{t('salary.base')}</TableHead>
                    <TableHead className="text-right">{t('salary.net')}</TableHead>
                    <TableHead className="text-right">{t('salary.accumulated')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.periodMonth}</TableCell>
                      <TableCell>
                        <div>{record.employeeCode ?? record.userId}</div>
                        <div className="text-xs text-muted-foreground">
                          {record.employeeEmail ?? '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(record.baseSalary, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(record.netSalary, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(record.accumulatedSalary, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canDeleteSalary ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={deleteRecordMutation.isPending}
                            onClick={() => setDeleteTargetRecord(record)}
                          >
                            <Trash2 className="size-4" />
                            {t('common.remove')}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState label={t('salary.emptyRecords')} />
            )
          ) : null}
        </CardContent>
      </Card>

      <Sheet
        open={Boolean(deleteTargetRecord)}
        onOpenChange={(open) => {
          if (!open && !deleteRecordMutation.isPending) {
            setDeleteTargetRecord(null)
          }
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t('salary.deleteRecordTitle')}</SheetTitle>
            <SheetDescription>{t('salary.deleteRecordDescription')}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 grid gap-4 rounded-md border p-4 text-sm">
            <div className="grid gap-1">
              <div className="text-muted-foreground">{t('common.employee')}</div>
              <div className="font-medium">
                {deleteTargetRecord?.employeeCode ?? deleteTargetRecord?.userId ?? '-'}
              </div>
              <div className="text-muted-foreground">
                {deleteTargetRecord?.employeeEmail ?? '-'}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1">
                <div className="text-muted-foreground">{t('common.period')}</div>
                <div className="font-medium">{deleteTargetRecord?.periodMonth ?? '-'}</div>
              </div>
              <div className="grid gap-1">
                <div className="text-muted-foreground">{t('salary.base')}</div>
                <div className="font-medium">
                  {deleteTargetRecord ? formatMoney(deleteTargetRecord.baseSalary, locale) : '-'}
                </div>
              </div>
              <div className="grid gap-1">
                <div className="text-muted-foreground">{t('salary.allowance')}</div>
                <div className="font-medium">
                  {deleteTargetRecord ? formatMoney(deleteTargetRecord.allowance, locale) : '-'}
                </div>
              </div>
              <div className="grid gap-1">
                <div className="text-muted-foreground">{t('salary.deduction')}</div>
                <div className="font-medium">
                  {deleteTargetRecord ? formatMoney(deleteTargetRecord.deduction, locale) : '-'}
                </div>
              </div>
              <div className="grid gap-1">
                <div className="text-muted-foreground">{t('salary.net')}</div>
                <div className="font-medium">
                  {deleteTargetRecord ? formatMoney(deleteTargetRecord.netSalary, locale) : '-'}
                </div>
              </div>
              <div className="grid gap-1">
                <div className="text-muted-foreground">{t('salary.accumulated')}</div>
                <div className="font-medium">
                  {deleteTargetRecord
                    ? formatMoney(deleteTargetRecord.accumulatedSalary, locale)
                    : '-'}
                </div>
              </div>
            </div>
            <div className="grid gap-1">
              <div className="text-muted-foreground">{t('salary.note')}</div>
              <div className="font-medium">{deleteTargetRecord?.note ?? '-'}</div>
            </div>
          </div>
          <SheetFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={deleteRecordMutation.isPending}
              onClick={() => setDeleteTargetRecord(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTargetRecord || deleteRecordMutation.isPending}
              onClick={() => {
                if (deleteTargetRecord) {
                  deleteRecordMutation.mutate(deleteTargetRecord)
                }
              }}
            >
              <Trash2 className="size-4" />
              {t('salary.confirmDeleteRecord')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
