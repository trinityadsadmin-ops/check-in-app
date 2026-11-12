'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { endOfDay, format, startOfDay } from 'date-fns'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Download,
  RefreshCcw,
  RotateCcw,
  X
} from 'lucide-react'
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorBanner } from '@/components/data/error-banner'
import { TableSkeleton } from '@/components/data/table-skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import type { ActionLog, ListActionLogsParams } from '@/generated/api/model'
import { UserCombobox } from '@/features/users/user-combobox'
import { listActionLogs } from '@/lib/api/backoffice'
import { getErrorMessage } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const PER_PAGE = 50
const EXPORT_PAGE_SIZE = 200
/** Keeps an unfiltered export from pulling the whole table into the browser. */
const EXPORT_MAX_ROWS = 20_000

type SortBy = NonNullable<ListActionLogsParams['sortBy']>
type SortDirection = NonNullable<ListActionLogsParams['sortDirection']>
type Translate = ReturnType<typeof useI18n>['t']

/**
 * Employee action timeline: for every key action, the moment the button was
 * pressed on the phone, what the app showed, and what the server actually did.
 * Filter by employee, date range or action ID, sort by any time/employee/action
 * column, and export the filtered list to Excel.
 */
export function ActionLogsCard() {
  const { locale, t } = useI18n()
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState('')
  const [actionId, setActionId] = useState('')
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>()
  const [onlyFailures, setOnlyFailures] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [isExporting, setIsExporting] = useState(false)

  const filterParams: ListActionLogsParams = {
    sortBy,
    sortDirection,
    ...(userId ? { userId } : {}),
    ...(actionId ? { actionId } : {}),
    ...(onlyFailures ? { outcome: 'FAILURE' } : {}),
    ...(dateRange?.from ? { from: startOfDay(dateRange.from).toISOString() } : {}),
    ...(dateRange?.from ? { to: endOfDay(dateRange.to ?? dateRange.from).toISOString() } : {})
  }
  const params = { ...filterParams, page, perPage: PER_PAGE }
  const query = useQuery({
    queryKey: ['action-logs', params],
    queryFn: () => listActionLogs(params),
    placeholderData: keepPreviousData
  })
  const logs = query.data?.actionLogs ?? []
  const total = query.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE))

  function setFilter<T>(setter: (value: T) => void, value: T) {
    setter(value)
    setPage(1)
  }

  function toggleSort(next: SortBy) {
    if (next === sortBy) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(next)
      setSortDirection(next === 'createdAt' || next === 'clientAt' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  const formatTime = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale, { hour12: false }) : '-'

  function formatDateRangeLabel() {
    if (!dateRange?.from) {
      return t('common.all')
    }
    const options = { day: 'numeric', month: 'short', year: 'numeric' } as const
    const from = dateRange.from.toLocaleDateString(locale, options)
    return dateRange.to ? `${from} - ${dateRange.to.toLocaleDateString(locale, options)}` : from
  }

  async function exportLogs() {
    setIsExporting(true)
    try {
      const rows: ActionLog[] = []
      let exportTotal = 0
      for (let exportPage = 1; rows.length < EXPORT_MAX_ROWS; exportPage += 1) {
        const response = await listActionLogs({ ...filterParams, page: exportPage, perPage: EXPORT_PAGE_SIZE })
        exportTotal = response.total
        rows.push(...response.actionLogs)
        if (response.actionLogs.length < EXPORT_PAGE_SIZE || rows.length >= response.total) {
          break
        }
      }

      const records = rows.slice(0, EXPORT_MAX_ROWS).map((log) => ({
        [t('logs.serverTime')]: formatTime(log.createdAt),
        [t('logs.phoneTime')]: formatTime(log.clientAt),
        [t('common.employee')]: log.user?.fullName ?? '',
        [t('users.employeeCode')]: log.user?.employeeCode ?? '',
        [t('logs.action')]: log.action,
        [t('logs.step')]: `${sourceLabel(log, t)} · ${phaseLabel(log, t)}`,
        [t('common.status')]: log.outcome ? outcomeLabel(log, t) : '',
        [t('logs.httpStatus')]: log.httpStatus ?? '',
        [t('logs.errorCode')]: log.errorCode ?? '',
        [t('logs.error')]: log.errorMessage ?? '',
        [t('logs.photoSource')]: photoSourceText(log, locale, t),
        [t('logs.actionId')]: log.actionId,
        [t('logs.device')]: log.deviceUuid ?? '',
        [t('logs.ipAddress')]: log.ipAddress ?? ''
      }))
      const worksheet = XLSX.utils.json_to_sheet(records)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Action log')
      XLSX.writeFile(workbook, `action-log-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)

      if (exportTotal > EXPORT_MAX_ROWS) {
        toast.warning(t('logs.exportTruncated').replace('{count}', EXPORT_MAX_ROWS.toLocaleString(locale)))
      } else {
        toast.success(t('logs.exported'))
      }
    } catch (error) {
      toast.error(t('toast.actionFailed'), { description: getErrorMessage(error) })
    } finally {
      setIsExporting(false)
    }
  }

  function SortableHead({ label, value }: { label: string; value: SortBy }) {
    const Icon = sortBy !== value ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown
    return (
      <TableHead>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 gap-1.5 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => toggleSort(value)}
        >
          {label}
          <Icon className="size-3.5" />
        </Button>
      </TableHead>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="grid gap-1.5">
            <CardTitle>{t('logs.actionTitle')}</CardTitle>
            <CardDescription>{t('logs.actionHint')}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportLogs()}
              disabled={isExporting || query.isFetching || total === 0}
            >
              <Download className="size-4" />
              {isExporting ? t('attendance.exporting') : t('attendance.export')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCcw className="size-4" />
              {t('common.refresh')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label>{t('attendance.employeeFilter')}</Label>
            <div className="flex w-72 gap-2">
              <UserCombobox
                value={userId}
                onValueChange={(value) => setFilter(setUserId, value)}
                placeholder={t('users.selectUser')}
              />
              {userId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('common.reset')}
                  onClick={() => setFilter(setUserId, '')}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t('attendance.dateFrom')} - {t('attendance.dateTo')}</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('w-72 justify-start text-left font-normal', !dateRange?.from && 'text-muted-foreground')}
                  >
                    <CalendarDays className="size-4" />
                    {formatDateRangeLabel()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="range" selected={dateRange} onSelect={(range) => setFilter(setDateRangeState, range)} />
                </PopoverContent>
              </Popover>
              {dateRange?.from ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('common.reset')}
                  onClick={() => setFilter(setDateRangeState, undefined)}
                >
                  <RotateCcw className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
          <Button
            variant={onlyFailures ? 'default' : 'outline'}
            onClick={() => setFilter(setOnlyFailures, !onlyFailures)}
          >
            {t('logs.onlyFailures')}
          </Button>
          {actionId ? (
            <div className="flex items-center gap-1">
              <Badge variant="secondary">
                {t('logs.filteredBy')}: {t('logs.actionId')} {actionId.slice(0, 8)}
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => setFilter(setActionId, '')}>
                {t('logs.clearFilter')}
              </Button>
            </div>
          ) : null}
        </div>

        {query.isLoading ? <TableSkeleton rows={6} /> : null}
        {query.isError ? <ErrorBanner error={query.error} /> : null}
        {query.data ? (
          logs.length > 0 ? (
            <div className="grid gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label={t('logs.serverTime')} value="createdAt" />
                    <SortableHead label={t('logs.phoneTime')} value="clientAt" />
                    <SortableHead label={t('common.employee')} value="employee" />
                    <SortableHead label={t('logs.action')} value="action" />
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('logs.error')}</TableHead>
                    <TableHead>{t('logs.actionId')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{formatTime(log.createdAt)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatTime(log.clientAt)}
                      </TableCell>
                      <TableCell>
                        {log.userId ? (
                          <button
                            type="button"
                            className="text-left underline-offset-2 hover:underline"
                            onClick={() => setFilter(setUserId, log.userId as string)}
                          >
                            {log.user?.fullName ?? log.user?.employeeCode ?? log.userId}
                          </button>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{log.action}</span>
                        {photoSourceBadge(log, locale, t)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">
                            {sourceLabel(log, t)} · {phaseLabel(log, t)}
                          </Badge>
                          {log.outcome ? (
                            <Badge variant={log.outcome === 'FAILURE' ? 'destructive' : 'secondary'}>
                              {outcomeLabel(log, t)}
                              {log.httpStatus ? ` (${log.httpStatus})` : ''}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-56 max-w-80 whitespace-normal text-sm">
                        {log.errorCode ? <span className="font-mono text-xs">{log.errorCode}</span> : null}
                        {log.errorMessage ? (
                          <span className="block text-muted-foreground">{log.errorMessage}</span>
                        ) : null}
                        {!log.errorCode && !log.errorMessage ? '-' : null}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="font-mono text-xs underline-offset-2 hover:underline"
                          onClick={() => setFilter(setActionId, log.actionId)}
                        >
                          {log.actionId.slice(0, 8)}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                <span>
                  {page} / {lastPage} · {total.toLocaleString(locale)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  {t('common.previous')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= lastPage}
                  onClick={() => setPage((value) => value + 1)}
                >
                  {t('common.next')}
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState label={t('logs.emptyAction')} />
          )
        ) : null}
      </CardContent>
    </Card>
  )
}

function sourceLabel(log: ActionLog, t: Translate) {
  return t(log.source === 'SERVER' ? 'logs.source.SERVER' : 'logs.source.CLIENT')
}

function phaseLabel(log: ActionLog, t: Translate) {
  return t(log.phase === 'INTENT' ? 'logs.phase.INTENT' : 'logs.phase.RESULT')
}

function outcomeLabel(log: ActionLog, t: Translate) {
  return t(log.outcome === 'FAILURE' ? 'logs.outcome.FAILURE' : 'logs.outcome.SUCCESS')
}

/** For photo captures: whether it was a live camera shot or a file picked from the gallery. */
function photoSource(log: ActionLog, locale: string) {
  const meta = (log.metadata ?? {}) as { source?: unknown; fileLastModified?: unknown }
  if (log.action !== 'camera.capture' || log.phase !== 'INTENT') {
    return null
  }
  if (meta.source === 'file') {
    const fileDate =
      typeof meta.fileLastModified === 'string'
        ? new Date(meta.fileLastModified).toLocaleString(locale, { hour12: false })
        : null
    return { kind: 'file' as const, fileDate }
  }
  return meta.source === 'stream' ? { kind: 'stream' as const, fileDate: null } : null
}

function photoSourceText(log: ActionLog, locale: string, t: Translate) {
  const source = photoSource(log, locale)
  if (!source) {
    return ''
  }
  if (source.kind === 'stream') {
    return t('logs.photoLive')
  }
  return `${t('logs.photoFromFile')}${source.fileDate ? ` ${source.fileDate}` : ''}`
}

function photoSourceBadge(log: ActionLog, locale: string, t: Translate) {
  const source = photoSource(log, locale)
  if (!source) {
    return null
  }
  return (
    <Badge variant={source.kind === 'file' ? 'destructive' : 'secondary'} className="mt-1 block w-fit">
      {source.kind === 'file'
        ? `${t('logs.photoFromFile')}${source.fileDate ? ` · ${source.fileDate}` : ''}`
        : t('logs.photoLive')}
    </Badge>
  )
}
