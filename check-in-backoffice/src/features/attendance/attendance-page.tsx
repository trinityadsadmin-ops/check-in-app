'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { CalendarDays, Check, ChevronsUpDown, Download, ExternalLink, RefreshCcw, RotateCcw, ArrowDown, ArrowUp, ArrowUpDown, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorBanner } from '@/components/data/error-banner'
import { TableSkeleton } from '@/components/data/table-skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type {
  AttendanceDay,
  AttendanceDayReviewStatus,
  AttendanceEvent,
  ListAttendanceParams,
  WorkLocation
} from '@/generated/api/model'
import { UserCombobox } from '@/features/users/user-combobox'
import { usePermissions } from '@/hooks/use-permissions'
import { listAttendance, listWorkLocations, reviewAttendance } from '@/lib/api/backoffice'
import { getErrorMessage } from '@/lib/api/errors'
import { translateStatusKey, useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type ReviewStatusFilter = '' | AttendanceDayReviewStatus
type AttendanceSortBy = NonNullable<ListAttendanceParams['sortBy']>
type SortDirection = NonNullable<ListAttendanceParams['sortDirection']>
type AttendanceEventRecord = Exclude<AttendanceEvent, null>

type AttendanceVisit = {
  id: string
  checkIn: AttendanceEventRecord | null
  checkOut: AttendanceEventRecord | null
  workLocationNames: string[]
}

const attendancePerPage = 20

function statusVariant(status: AttendanceDayReviewStatus) {
  if (status === 'APPROVED') {
    return 'outline'
  }

  if (status === 'REJECTED') {
    return 'destructive'
  }

  return 'secondary'
}

function formatTime(value: string | null | undefined, locale: string) {
  return value ? new Date(value).toLocaleString(locale) : '-'
}

function formatLocation(lat?: number, lng?: number) {
  if (lat === undefined || lng === undefined) {
    return '-'
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function getEmployeeLabel(day: { user: { fullName: string | null; email: string | null } | null; userId: string }) {
  return day.user?.fullName ?? day.user?.email ?? day.userId
}

function getEmployeeDescription(day: { user: { employeeCode: string | null; email: string | null } | null; userId: string }) {
  return day.user?.employeeCode ?? day.user?.email ?? day.userId
}

function getAttendanceVisits(day: AttendanceDay): AttendanceVisit[] {
  const locationNamesById = new Map(
    day.workLocations.map((location) => [location.id, location.name])
  )
  const events = day.events
    .filter((event): event is AttendanceEventRecord => event !== null)
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
  const visits: AttendanceVisit[] = []
  let openVisit: AttendanceVisit | null = null

  for (const event of events) {
    const locationName = event.workAreaSnapshot
      ? locationNamesById.get(event.workAreaSnapshot.workLocationId)
      : undefined

    if (event.type === 'CHECK_IN') {
      openVisit = {
        id: event.id,
        checkIn: event,
        checkOut: null,
        workLocationNames: locationName ? [locationName] : []
      }
      visits.push(openVisit)
      continue
    }

    if (!openVisit) {
      visits.push({
        id: event.id,
        checkIn: null,
        checkOut: event,
        workLocationNames: locationName ? [locationName] : []
      })
      continue
    }

    openVisit.checkOut = event
    if (locationName && !openVisit.workLocationNames.includes(locationName)) {
      openVisit.workLocationNames.push(locationName)
    }
    openVisit = null
  }

  return visits.length > 0
    ? visits
    : [
        {
          id: day.id,
          checkIn: day.checkIn,
          checkOut: day.checkOut,
          workLocationNames: day.workLocations.map((location) => location.name)
        }
      ]
}

export function AttendancePage() {
  const queryClient = useQueryClient()
  const { locale, t } = useI18n()
  const { has, permissions } = usePermissions()
  const canReviewAttendance = has(permissions.attendanceReview)
  const [reviewStatus, setReviewStatus] = useState<ReviewStatusFilter>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [workLocationId, setWorkLocationId] = useState('')
  const [workLocationOpen, setWorkLocationOpen] = useState(false)
  const [attendancePage, setAttendancePage] = useState(1)
  const [sortBy, setSortBy] = useState<AttendanceSortBy>('workDate')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [isExporting, setIsExporting] = useState(false)
  const workLocationsQuery = useQuery({
    queryKey: ['work-locations'],
    queryFn: listWorkLocations
  })
  const selectedWorkLocation = useMemo(
    () =>
      workLocationsQuery.data?.workLocations.find((location) => location.id === workLocationId) ??
      null,
    [workLocationId, workLocationsQuery.data?.workLocations]
  )

  const attendanceParams = useMemo<ListAttendanceParams>(
    () => ({
      page: attendancePage,
      perPage: attendancePerPage,
      sortBy,
      sortDirection,
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(employeeId ? { userId: employeeId } : {}),
      ...(workLocationId ? { workLocationId } : {})
    }),
    [attendancePage, dateFrom, dateTo, employeeId, reviewStatus, sortBy, sortDirection, workLocationId]
  )

  const attendanceQuery = useQuery({
    queryKey: ['attendance', attendanceParams],
    queryFn: () => listAttendance(attendanceParams)
  })
  const reviewMutation = useMutation({
    mutationFn: (input: { attendanceDayId: string; status: AttendanceDayReviewStatus }) =>
      reviewAttendance(input.attendanceDayId, {
        reviewStatus: input.status,
        ...(reviewNote ? { reviewNote } : {})
      }),
    onSuccess: (_response, input) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      toast.success(
        input.status === 'APPROVED'
          ? t('attendance.toastApproved')
          : t('attendance.toastRejected')
      )
    },
    onError: (error) =>
      toast.error(t('toast.actionFailed'), {
        description: getErrorMessage(error)
      })
  })

  const attendanceDays = attendanceQuery.data?.attendanceDays ?? []
  const totalPages = Math.max(
    1,
    Math.ceil((attendanceQuery.data?.total ?? 0) / attendancePerPage)
  )
  const rangeStart = attendanceQuery.data?.total
    ? (attendancePage - 1) * attendancePerPage + 1
    : 0
  const rangeEnd = Math.min(attendancePage * attendancePerPage, attendanceQuery.data?.total ?? 0)
  const selectedDateRange = useMemo<DateRange | undefined>(() => {
    if (!dateFrom) {
      return undefined
    }

    return {
      from: parseISO(dateFrom),
      ...(dateTo ? { to: parseISO(dateTo) } : {})
    }
  }, [dateFrom, dateTo])

  function setDateRange(range: DateRange | undefined) {
    setDateFrom(range?.from ? format(range.from, 'yyyy-MM-dd') : '')
    setDateTo(range?.to ? format(range.to, 'yyyy-MM-dd') : '')
    setAttendancePage(1)
  }

  function setFilter<T>(setter: (value: T) => void, value: T) {
    setter(value)
    setAttendancePage(1)
  }

  function toggleSort(nextSortBy: AttendanceSortBy) {
    if (nextSortBy === sortBy) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(nextSortBy)
      setSortDirection(nextSortBy === 'workDate' ? 'desc' : 'asc')
    }
    setAttendancePage(1)
  }

  function SortableHead({
    label,
    value,
    className
  }: {
    label: string
    value: AttendanceSortBy
    className?: string
  }) {
    const Icon = sortBy !== value ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown

    return (
      <TableHead className={className}>
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

  async function exportAttendance() {
    setIsExporting(true)
    try {
      const firstPage = await listAttendance({ ...attendanceParams, page: 1, perPage: 100 })
      const pages = [firstPage]
      const exportPageCount = Math.ceil(firstPage.total / firstPage.perPage)

      for (let page = 2; page <= exportPageCount; page += 1) {
        pages.push(await listAttendance({ ...attendanceParams, page, perPage: 100 }))
      }

      const records = pages.flatMap((response) =>
        response.attendanceDays.flatMap((day) =>
          getAttendanceVisits(day).map((visit) => ({
            [t('attendance.workDate')]: day.workDate,
            [t('common.employee')]: getEmployeeLabel(day),
            [t('users.employeeCode')]: getEmployeeDescription(day),
            [t('attendance.workLocation')]: visit.workLocationNames.join(', '),
            [t('attendance.checkIn')]: formatTime(visit.checkIn?.capturedAt, locale),
            [t('attendance.checkInComment')]: visit.checkIn?.manualReason ?? '',
            [t('attendance.checkOut')]: formatTime(visit.checkOut?.capturedAt, locale),
            [t('attendance.checkOutComment')]: visit.checkOut?.manualReason ?? '',
            [t('common.status')]: t(translateStatusKey(day.reviewStatus))
          }))
        )
      )
      const worksheet = XLSX.utils.json_to_sheet(records)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, t('attendance.title'))
      XLSX.writeFile(workbook, `attendance-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success(t('attendance.exported'))
    } catch (error) {
      toast.error(t('toast.actionFailed'), { description: getErrorMessage(error) })
    } finally {
      setIsExporting(false)
    }
  }

  function formatDateRangeLabel() {
    if (!selectedDateRange?.from) {
      return t('common.all')
    }

    const from = selectedDateRange.from.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })

    if (!selectedDateRange.to) {
      return from
    }

    return `${from} - ${selectedDateRange.to.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })}`
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>{t('attendance.reviewTitle')}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportAttendance()}
              disabled={
                isExporting || attendanceQuery.isFetching || attendanceQuery.data?.total === 0
              }
            >
              <Download className="size-4" />
              {isExporting ? t('attendance.exporting') : t('attendance.export')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => attendanceQuery.refetch()}
              disabled={attendanceQuery.isFetching}
            >
              <RefreshCcw className="size-4" />
              {t('common.refresh')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="review-status">{t('attendance.reviewStatus')}</Label>
            <Select
              value={reviewStatus || 'ALL'}
              onValueChange={(value) =>
                setFilter(
                  setReviewStatus,
                  value === 'ALL' ? '' : (value as ReviewStatusFilter)
                )
              }
            >
              <SelectTrigger id="review-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('common.all')}</SelectItem>
                <SelectItem value="PENDING">{t('status.pending')}</SelectItem>
                <SelectItem value="APPROVED">{t('status.approved')}</SelectItem>
                <SelectItem value="REJECTED">{t('status.rejected')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>{t('attendance.dateFrom')} - {t('attendance.dateTo')}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'w-72 justify-start text-left font-normal',
                    !selectedDateRange?.from && 'text-muted-foreground'
                  )}
                >
                  <CalendarDays className="size-4" />
                  {formatDateRangeLabel()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={selectedDateRange}
                  onSelect={setDateRange}
                />
              </PopoverContent>
            </Popover>
          </div>
          {selectedDateRange?.from ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('common.reset')}
                  onClick={() => setDateRange(undefined)}
                >
                  <RotateCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('common.reset')}</TooltipContent>
            </Tooltip>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="review-note">{t('attendance.reviewNote')}</Label>
            <Input
              id="review-note"
              value={reviewNote}
              placeholder={t('common.optional')}
              disabled={!canReviewAttendance}
              onChange={(event) => setReviewNote(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t('attendance.employeeFilter')}</Label>
            <div className="flex w-72 gap-2">
              <UserCombobox
                value={employeeId}
                onValueChange={(value) => setFilter(setEmployeeId, value)}
                placeholder={t('users.selectUser')}
              />
              {employeeId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('common.reset')}
                  onClick={() => setFilter(setEmployeeId, '')}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t('attendance.workLocationFilter')}</Label>
            <div className="flex w-72 gap-2">
              <Popover open={workLocationOpen} onOpenChange={setWorkLocationOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={workLocationOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedWorkLocation?.name ?? t('attendance.selectWorkLocation')}
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t('attendance.searchWorkLocation')} />
                    <CommandList>
                      <CommandEmpty>{t('attendance.noWorkLocation')}</CommandEmpty>
                      <CommandGroup>
                        {(workLocationsQuery.data?.workLocations ?? []).map((location: WorkLocation) => (
                          <CommandItem
                            key={location.id}
                            value={location.name}
                            onSelect={() => {
                              setFilter(setWorkLocationId, location.id)
                              setWorkLocationOpen(false)
                            }}
                          >
                            <Check className={cn('size-4', workLocationId === location.id ? 'opacity-100' : 'opacity-0')} />
                            <span className="truncate">{location.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {workLocationId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('common.reset')}
                  onClick={() => setFilter(setWorkLocationId, '')}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {attendanceQuery.isLoading ? <TableSkeleton /> : null}
        {attendanceQuery.isError ? <ErrorBanner error={attendanceQuery.error} /> : null}
        {reviewMutation.isError ? <ErrorBanner error={reviewMutation.error} /> : null}

        {attendanceQuery.data ? (
          attendanceDays.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label={t('attendance.workDate')} value="workDate" />
                  <SortableHead label={t('common.employee')} value="employee" />
                  <SortableHead label={t('attendance.workLocation')} value="workLocation" />
                  <SortableHead label={t('attendance.checkIn')} value="checkIn" />
                  <SortableHead label={t('attendance.checkOut')} value="checkOut" />
                  <SortableHead label={t('common.status')} value="reviewStatus" />
                  <TableHead className="w-48 text-right">{t('attendance.review')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceDays.flatMap((day) => {
                  const visits = getAttendanceVisits(day)

                  return visits.map((visit, index) => (
                    <TableRow key={`${day.id}-${visit.id}`}>
                      {index === 0 ? (
                        <TableCell rowSpan={visits.length} className="align-top font-medium">
                          {day.workDate}
                        </TableCell>
                      ) : null}
                      {index === 0 ? (
                        <TableCell rowSpan={visits.length} className="align-top">
                          <div className="font-medium">{getEmployeeLabel(day)}</div>
                          <div className="text-xs text-muted-foreground">
                            {getEmployeeDescription(day)}
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell>
                        {visit.workLocationNames.length > 0 ? (
                          <div className="grid gap-1">
                            {visit.workLocationNames.map((locationName) => (
                              <span key={locationName}>{locationName}</span>
                            ))}
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {formatTime(visit.checkIn?.capturedAt, locale)}
                          {visit.checkIn?.isManual ? <Badge variant="destructive">{t('attendance.manual')}</Badge> : null}
                        </div>
                        {visit.checkIn?.isManual && visit.checkIn.manualReason ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('attendance.manualReason')}: {visit.checkIn.manualReason}
                          </p>
                        ) : null}
                        {visit.checkIn && visit.checkIn.lat != null && visit.checkIn.lng != null ? (
                          <a
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                            href={`https://www.openstreetmap.org/?mlat=${visit.checkIn.lat}&mlon=${visit.checkIn.lng}#map=18/${visit.checkIn.lat}/${visit.checkIn.lng}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {formatLocation(visit.checkIn.lat, visit.checkIn.lng)}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                        {visit.checkIn?.photoUrl ? (
                          <a
                            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                            href={visit.checkIn.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('common.photo')} <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {formatTime(visit.checkOut?.capturedAt, locale)}
                          {visit.checkOut?.isManual ? <Badge variant="destructive">{t('attendance.manual')}</Badge> : null}
                        </div>
                        {visit.checkOut?.isManual && visit.checkOut.manualReason ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('attendance.manualReason')}: {visit.checkOut.manualReason}
                          </p>
                        ) : null}
                        {visit.checkOut && visit.checkOut.lat != null && visit.checkOut.lng != null ? (
                          <a
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                            href={`https://www.openstreetmap.org/?mlat=${visit.checkOut.lat}&mlon=${visit.checkOut.lng}#map=18/${visit.checkOut.lat}/${visit.checkOut.lng}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {formatLocation(visit.checkOut.lat, visit.checkOut.lng)}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                        {visit.checkOut?.photoUrl ? (
                          <a
                            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                            href={visit.checkOut.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('common.photo')} <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                      </TableCell>
                      {index === 0 ? (
                        <TableCell rowSpan={visits.length} className="align-top">
                          <Badge variant={statusVariant(day.reviewStatus)}>
                            {t(translateStatusKey(day.reviewStatus))}
                          </Badge>
                        </TableCell>
                      ) : null}
                      {index === 0 ? (
                        <TableCell rowSpan={visits.length} className="align-top">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={reviewMutation.isPending || !canReviewAttendance}
                              onClick={() =>
                                reviewMutation.mutate({
                                  attendanceDayId: day.id,
                                  status: 'APPROVED'
                                })
                              }
                            >
                              {t('attendance.approve')}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={reviewMutation.isPending || !canReviewAttendance}
                              onClick={() =>
                                reviewMutation.mutate({
                                  attendanceDayId: day.id,
                                  status: 'REJECTED'
                                })
                              }
                            >
                              {t('attendance.reject')}
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label={t('attendance.empty')} />
          )
        ) : null}
        {attendanceQuery.data && attendanceDays.length > 0 ? (
          <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              {rangeStart}-{rangeEnd} / {attendanceQuery.data.total}
            </div>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={attendancePage <= 1 || attendanceQuery.isFetching}
                    className={
                      attendancePage <= 1 || attendanceQuery.isFetching
                        ? 'pointer-events-none opacity-50'
                        : undefined
                    }
                    onClick={(event) => {
                      event.preventDefault()
                      setAttendancePage((current) => Math.max(1, current - 1))
                    }}
                  >
                    {t('common.previous')}
                  </PaginationPrevious>
                </PaginationItem>
                <PaginationItem>
                  <span className="block min-w-24 text-center text-sm text-muted-foreground">
                    {t('attendance.page')} {attendancePage} / {totalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={attendancePage >= totalPages || attendanceQuery.isFetching}
                    className={
                      attendancePage >= totalPages || attendanceQuery.isFetching
                        ? 'pointer-events-none opacity-50'
                        : undefined
                    }
                    onClick={(event) => {
                      event.preventDefault()
                      setAttendancePage((current) => Math.min(totalPages, current + 1))
                    }}
                  >
                    {t('common.next')}
                  </PaginationNext>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
