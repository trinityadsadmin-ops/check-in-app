'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ClipboardCheck, CalendarDays, ExternalLink, RefreshCcw, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorBanner } from '@/components/data/error-banner'
import { TableSkeleton } from '@/components/data/table-skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
import { Textarea } from '@/components/ui/textarea'
import type { AreaInspection, AreaInspectionReviewStatus } from '@/generated/api/model'
import { usePermissions } from '@/hooks/use-permissions'
import {
  deleteAreaInspection,
  listAreaInspections,
  reviewAreaInspection
} from '@/lib/api/backoffice'
import { getErrorMessage } from '@/lib/api/errors'
import { translateStatusKey, useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

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
  const resolveErrorCode = (code: string) => {
    const key = `errors.${code}`
    const message = t(key)

    return message === key ? undefined : message
  }

  const inspectionsQuery = useQuery({
    queryKey: ['areaInspections', { dateFrom, dateTo }],
    queryFn: () =>
      listAreaInspections({
        page: 1,
        perPage: 100,
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {})
      })
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
        </div>

        {inspectionsQuery.isLoading ? <TableSkeleton /> : null}
        {inspectionsQuery.isError ? <ErrorBanner error={inspectionsQuery.error} /> : null}

        {inspectionsQuery.data ? (
          inspections.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.photo')}</TableHead>
                  <TableHead>{t('common.employee')}</TableHead>
                  <TableHead>{t('areaInspections.site')}</TableHead>
                  <TableHead>{t('common.location')}</TableHead>
                  <TableHead>{t('areaInspections.capturedAt')}</TableHead>
                  <TableHead>{t('areaInspections.notes')}</TableHead>
                  <TableHead>{t('areaInspections.reviewStatus')}</TableHead>
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
      </CardContent>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('areaInspections.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('areaInspections.deleteDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('common.cancel')}</Button>
            </DialogClose>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pendingReview !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingReview(null)
            setReviewNote('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('areaInspections.reviewTitle')}</DialogTitle>
            <DialogDescription>{t('areaInspections.reviewDescription')}</DialogDescription>
          </DialogHeader>
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
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={reviewMutation.isPending}>
                {t('common.cancel')}
              </Button>
            </DialogClose>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
