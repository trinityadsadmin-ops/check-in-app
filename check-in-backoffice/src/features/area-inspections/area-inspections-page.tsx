'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, Check, ChevronsUpDown, ClipboardCheck, Download, ExternalLink, RefreshCcw, RotateCcw, Trash2, X } from 'lucide-react'
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import type { AreaInspection, AreaInspectionReviewStatus, ListAreaInspectionsParams, WorkLocation } from '@/generated/api/model'
import { UserCombobox } from '@/features/users/user-combobox'
import { usePermissions } from '@/hooks/use-permissions'
import {
  deleteAreaInspection,
  listAreaInspections,
  listWorkLocations,
  reviewAreaInspection
} from '@/lib/api/backoffice'
import { getErrorMessage } from '@/lib/api/errors'
import { translateStatusKey, useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type AreaInspectionSortBy = NonNullable<ListAreaInspectionsParams['sortBy']>
type SortDirection = NonNullable<ListAreaInspectionsParams['sortDirection']>

const inspectionsPerPage = 20

function formatTime(value: string | null | undefined, locale: string) {
  return value ? new Date(value).toLocaleString(locale) : '-'
}

function formatLocation(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) {
    return '-'
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function statusVariant(status: AreaInspectionReviewStatus) {
  if (status === 'APPROVED') {
    return 'outline'
  }

  if (status === 'REJECTED') {
    return 'destructive'
  }

  return 'secondary'
}

export function AreaInspectionsPage() {
  const queryClient = useQueryClient()
  const { locale, t } = useI18n()
  const { has, permissions } = usePermissions()
  const canReview = has(permissions.areaInspectionsReview)
  const canDelete = has(permissions.areaInspectionsDelete)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [pendingDelete, setPendingDelete] = useState<AreaInspection | null>(null)
  const [pendingReview, setPendingReview] = useState<AreaInspection | null>(null)
  const [reviewStatus, setReviewStatus] = useState<'APPROVED' | 'REJECTED'>('APPROVED')
  const [reviewNote, setReviewNote] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [workLocationId, setWorkLocationId] = useState('')
  const [workLocationOpen, setWorkLocationOpen] = useState(false)
  const [inspectionPage, setInspectionPage] = useState(1)
  const [sortBy, setSortBy] = useState<AreaInspectionSortBy>('capturedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [isExporting, setIsExporting] = useState(false)
  const resolveErrorCode = (code: string) => {
    const key = `errors.${code}`
    const message = t(key)

    return message === key ? undefined : message
  }

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
  const inspectionParams = useMemo<ListAreaInspectionsParams>(
    () => ({
      page: inspectionPage,
      perPage: inspectionsPerPage,
      sortBy,
      sortDirection,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(employeeId ? { userId: employeeId } : {}),
      ...(workLocationId ? { workLocationId } : {})
    }),
    [dateFrom, dateTo, employeeId, inspectionPage, sortBy, sortDirection, workLocationId]
  )
  const inspectionsQuery = useQuery({
    queryKey: ['areaInspections', inspectionParams],
    queryFn: () => listAreaInspections(inspectionParams)
  })

  const deleteMutation = useMutation({
    mutationFn: (areaInspectionId: string) => deleteAreaInspection(areaInspectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['areaInspections'] })
      setPendingDelete(null)
      toast.success(t('areaInspections.toastDeleted'))
    },
    onError: (error) =>
      toast.error(t('toast.actionFailed'), {
        description: getErrorMessage(error, resolveErrorCode)
      })
  })
  const reviewMutation = useMutation({
    mutationFn: () => {
      if (!pendingReview) {
        throw new Error('No area inspection selected for review')
      }

      return reviewAreaInspection(pendingReview.id, {
        reviewStatus,
        ...(reviewNote.trim() ? { reviewNote: reviewNote.trim() } : {})
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['areaInspections'] })
      const isApproved = reviewStatus === 'APPROVED'
      setPendingReview(null)
      setReviewNote('')
      toast.success(isApproved ? t('areaInspections.toastApproved') : t('areaInspections.toastRejected'))
    },
    onError: (error) =>
      toast.error(t('toast.actionFailed'), {
        description: getErrorMessage(error, resolveErrorCode)
      })
  })

  const inspections = inspectionsQuery.data?.areaInspections ?? []
  const totalPages = Math.max(
    1,
    Math.ceil((inspectionsQuery.data?.total ?? 0) / inspectionsPerPage)
  )
  const rangeStart = inspectionsQuery.data?.total
    ? (inspectionPage - 1) * inspectionsPerPage + 1
    : 0
  const rangeEnd = Math.min(inspectionPage * inspectionsPerPage, inspectionsQuery.data?.total ?? 0)
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
    setInspectionPage(1)
  }

  function setFilter<T>(setter: (value: T) => void, value: T) {
    setter(value)
    setInspectionPage(1)
  }

  function toggleSort(nextSortBy: AreaInspectionSortBy) {
    if (nextSortBy === sortBy) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(nextSortBy)
      setSortDirection(nextSortBy === 'capturedAt' ? 'desc' : 'asc')
    }
    setInspectionPage(1)
  }

  function SortableHead({
    label,
    value,
    className
  }: {
    label: string
    value: AreaInspectionSortBy
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

  async function exportInspections() {
    setIsExporting(true)
    try {
      const firstPage = await listAreaInspections({ ...inspectionParams, page: 1, perPage: 100 })
      const pages = [firstPage]
      const exportPageCount = Math.ceil(firstPage.total / firstPage.perPage)

      for (let page = 2; page <= exportPageCount; page += 1) {
        pages.push(await listAreaInspections({ ...inspectionParams, page, perPage: 100 }))
      }

      const records = pages.flatMap((response) => response.areaInspections).map((inspection) => ({
        [t('common.employee')]: inspection.user?.fullName ?? inspection.user?.email ?? '-',
        [t('users.employeeCode')]: inspection.user?.employeeCode ?? inspection.user?.email ?? '',
        [t('areaInspections.site')]: inspection.workLocationName ?? '-',
        [t('common.location')]: formatLocation(inspection.lat, inspection.lng),
        [t('areaInspections.capturedAt')]: formatTime(inspection.capturedAt, locale),
        [t('areaInspections.notes')]: inspection.notes ?? '',
        [t('areaInspections.reviewStatus')]: t(translateStatusKey(inspection.reviewStatus))
      }))
      const worksheet = XLSX.utils.json_to_sheet(records)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, t('areaInspections.title'))
      XLSX.writeFile(workbook, `area-inspections-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success(t('areaInspections.exported'))
    } catch (error) {
      toast.error(t('toast.actionFailed'), { description: getErrorMessage(error, resolveErrorCode) })
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

  function openReview(inspection: AreaInspection) {
    setPendingReview(inspection)
    setReviewStatus(inspection.reviewStatus === 'REJECTED' ? 'REJECTED' : 'APPROVED')
    setReviewNote(inspection.reviewNote ?? '')
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>{t('areaInspections.listTitle')}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportInspections()}
              disabled={
                isExporting || inspectionsQuery.isFetching || inspectionsQuery.data?.total === 0
              }
            >
              <Download className="size-4" />
              {isExporting ? t('areaInspections.exporting') : t('areaInspections.export')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inspectionsQuery.refetch()}
              disabled={inspectionsQuery.isFetching}
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
            <Label>{t('areaInspections.employeeFilter')}</Label>
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
            <Label>{t('areaInspections.workLocationFilter')}</Label>
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
                      {selectedWorkLocation?.name ?? t('areaInspections.selectWorkLocation')}
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t('areaInspections.searchWorkLocation')} />
                    <CommandList>
                      <CommandEmpty>{t('areaInspections.noWorkLocation')}</CommandEmpty>
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

        {inspectionsQuery.isLoading ? <TableSkeleton /> : null}
        {inspectionsQuery.isError ? <ErrorBanner error={inspectionsQuery.error} /> : null}

        {inspectionsQuery.data ? (
          inspections.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.photo')}</TableHead>
                  <SortableHead label={t('common.employee')} value="employee" />
                  <SortableHead label={t('areaInspections.site')} value="workLocation" />
                  <SortableHead label={t('common.location')} value="location" />
                  <SortableHead label={t('areaInspections.capturedAt')} value="capturedAt" />
                  <SortableHead label={t('areaInspections.notes')} value="notes" />
                  <SortableHead label={t('areaInspections.reviewStatus')} value="reviewStatus" />
                  {canReview || canDelete ? (
                    <TableHead className="w-44 text-right">{t('common.actions')}</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell>
                      {inspection.photoUrl ? (
                        <a
                          href={inspection.photoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={inspection.photoUrl}
                            alt=""
                            className="size-14 rounded-md object-cover"
                          />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {inspection.user?.fullName ??
                          inspection.user?.email ??
                          '-'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {inspection.user?.employeeCode ?? inspection.user?.email ?? ''}
                      </div>
                    </TableCell>
                    <TableCell>{inspection.workLocationName ?? '-'}</TableCell>
                    <TableCell>
                      {inspection.lat !== null && inspection.lng !== null ? (
                        <a
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                          href={`https://www.openstreetmap.org/?mlat=${inspection.lat}&mlon=${inspection.lng}#map=18/${inspection.lat}/${inspection.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {formatLocation(inspection.lat, inspection.lng)}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{formatTime(inspection.capturedAt, locale)}</TableCell>
                    <TableCell className="max-w-xs whitespace-pre-wrap text-sm">
                      {inspection.notes ?? '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(inspection.reviewStatus)}>
                        {t(translateStatusKey(inspection.reviewStatus))}
                      </Badge>
                    </TableCell>
                    {canReview || canDelete ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canReview ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={reviewMutation.isPending}
                              onClick={() => openReview(inspection)}
                            >
                              <ClipboardCheck className="size-4" />
                              {t('areaInspections.review')}
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={t('areaInspections.deleteTitle')}
                              disabled={deleteMutation.isPending}
                              onClick={() => setPendingDelete(inspection)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label={t('areaInspections.empty')} />
          )
        ) : null}
        {inspectionsQuery.data && inspections.length > 0 ? (
          <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              {rangeStart}-{rangeEnd} / {inspectionsQuery.data.total}
            </div>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={inspectionPage <= 1 || inspectionsQuery.isFetching}
                    className={
                      inspectionPage <= 1 || inspectionsQuery.isFetching
                        ? 'pointer-events-none opacity-50'
                        : undefined
                    }
                    onClick={(event) => {
                      event.preventDefault()
                      setInspectionPage((current) => Math.max(1, current - 1))
                    }}
                  >
                    {t('common.previous')}
                  </PaginationPrevious>
                </PaginationItem>
                <PaginationItem>
                  <span className="block min-w-24 text-center text-sm text-muted-foreground">
                    {t('areaInspections.page')} {inspectionPage} / {totalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={inspectionPage >= totalPages || inspectionsQuery.isFetching}
                    className={
                      inspectionPage >= totalPages || inspectionsQuery.isFetching
                        ? 'pointer-events-none opacity-50'
                        : undefined
                    }
                    onClick={(event) => {
                      event.preventDefault()
                      setInspectionPage((current) => Math.min(totalPages, current + 1))
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

      <Sheet
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('areaInspections.deleteTitle')}</SheetTitle>
            <SheetDescription>
              {t('areaInspections.deleteDescription')}
            </SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">{t('common.cancel')}</Button>
            </SheetClose>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (pendingDelete) {
                  deleteMutation.mutate(pendingDelete.id)
                }
              }}
            >
              {t('areaInspections.confirmDelete')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Sheet
        open={pendingReview !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingReview(null)
            setReviewNote('')
          }
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t('areaInspections.reviewTitle')}</SheetTitle>
            <SheetDescription>{t('areaInspections.reviewDescription')}</SheetDescription>
          </SheetHeader>
          {pendingReview ? (
            <div className="grid gap-4">
              <div className="grid gap-1 rounded-md border p-3 text-sm">
                <div className="font-medium">
                  {pendingReview.user?.fullName ?? pendingReview.user?.email ?? '-'}
                </div>
                <div className="text-muted-foreground">
                  {pendingReview.workLocationName ?? '-'} · {formatTime(pendingReview.capturedAt, locale)}
                </div>
                {pendingReview.notes ? <div>{pendingReview.notes}</div> : null}
              </div>
              {pendingReview.photoUrl ? (
                <a href={pendingReview.photoUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingReview.photoUrl}
                    alt=""
                    className="max-h-72 w-full rounded-md border object-contain"
                  />
                </a>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="area-inspection-review-status">
                  {t('areaInspections.reviewStatus')}
                </Label>
                <Select
                  value={reviewStatus}
                  onValueChange={(value) => setReviewStatus(value as 'APPROVED' | 'REJECTED')}
                >
                  <SelectTrigger id="area-inspection-review-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">{t('status.approved')}</SelectItem>
                    <SelectItem value="REJECTED">{t('status.rejected')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="area-inspection-review-note">
                  {t('areaInspections.reviewNote')}
                </Label>
                <Textarea
                  id="area-inspection-review-note"
                  value={reviewNote}
                  aria-invalid={reviewStatus === 'REJECTED' && !reviewNote.trim()}
                  onChange={(event) => setReviewNote(event.target.value)}
                />
              </div>
              {reviewMutation.isError ? (
                <ErrorBanner
                  error={reviewMutation.error}
                  message={getErrorMessage(reviewMutation.error, resolveErrorCode)}
                />
              ) : null}
            </div>
          ) : null}
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline" disabled={reviewMutation.isPending}>
                {t('common.cancel')}
              </Button>
            </SheetClose>
            <Button
              disabled={
                !canReview ||
                reviewMutation.isPending ||
                (reviewStatus === 'REJECTED' && !reviewNote.trim())
              }
              onClick={() => reviewMutation.mutate()}
            >
              <ClipboardCheck className="size-4" />
              {t('areaInspections.saveReview')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  )
}
