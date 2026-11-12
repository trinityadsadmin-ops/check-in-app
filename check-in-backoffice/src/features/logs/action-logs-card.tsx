'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorBanner } from '@/components/data/error-banner'
import { TableSkeleton } from '@/components/data/table-skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import type { ActionLog, ListActionLogsOutcome } from '@/generated/api/model'
import { listActionLogs } from '@/lib/api/backoffice'
import { useI18n } from '@/lib/i18n'

const PER_PAGE = 50

type Filter =
  | { kind: 'user'; id: string; label: string }
  | { kind: 'action'; id: string }

/**
 * Employee action timeline: for every key action, the moment the button was
 * pressed on the phone, what the app showed, and what the server actually did.
 * Click an employee or an action ID to narrow the list down.
 */
export function ActionLogsCard() {
  const { locale, t } = useI18n()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<Filter | null>(null)
  const [onlyFailures, setOnlyFailures] = useState(false)

  const params = {
    page,
    perPage: PER_PAGE,
    ...(filter?.kind === 'user' ? { userId: filter.id } : {}),
    ...(filter?.kind === 'action' ? { actionId: filter.id } : {}),
    ...(onlyFailures ? { outcome: 'FAILURE' as ListActionLogsOutcome } : {})
  }
  const query = useQuery({
    queryKey: ['action-logs', params],
    queryFn: () => listActionLogs(params),
    placeholderData: keepPreviousData
  })
  const logs = query.data?.actionLogs ?? []
  const total = query.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE))

  const applyFilter = (next: Filter | null) => {
    setFilter(next)
    setPage(1)
  }

  const formatTime = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale, { hour12: false }) : '-'

  const employeeLabel = (log: ActionLog) =>
    log.user?.fullName ?? log.user?.employeeCode ?? log.userId ?? '-'

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('logs.actionTitle')}</CardTitle>
        <CardDescription>{t('logs.actionHint')}</CardDescription>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button
            size="sm"
            variant={onlyFailures ? 'default' : 'outline'}
            onClick={() => {
              setOnlyFailures((value) => !value)
              setPage(1)
            }}
          >
            {t('logs.onlyFailures')}
          </Button>
          {filter ? (
            <>
              <Badge variant="secondary">
                {t('logs.filteredBy')}:{' '}
                {filter.kind === 'user' ? filter.label : `${t('logs.actionId')} ${filter.id.slice(0, 8)}`}
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => applyFilter(null)}>
                {t('logs.clearFilter')}
              </Button>
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? <TableSkeleton rows={6} /> : null}
        {query.isError ? <ErrorBanner error={query.error} /> : null}
        {query.data ? (
          logs.length > 0 ? (
            <div className="grid gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('logs.serverTime')}</TableHead>
                    <TableHead>{t('logs.phoneTime')}</TableHead>
                    <TableHead>{t('common.employee')}</TableHead>
                    <TableHead>{t('logs.action')}</TableHead>
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
                            onClick={() =>
                              applyFilter({ kind: 'user', id: log.userId as string, label: employeeLabel(log) })
                            }
                          >
                            {employeeLabel(log)}
                          </button>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{log.action}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">
                            {t(log.source === 'SERVER' ? 'logs.source.SERVER' : 'logs.source.CLIENT')} ·{' '}
                            {t(log.phase === 'INTENT' ? 'logs.phase.INTENT' : 'logs.phase.RESULT')}
                          </Badge>
                          {log.outcome ? (
                            <Badge variant={log.outcome === 'FAILURE' ? 'destructive' : 'secondary'}>
                              {t(log.outcome === 'FAILURE' ? 'logs.outcome.FAILURE' : 'logs.outcome.SUCCESS')}
                              {log.httpStatus ? ` (${log.httpStatus})` : ''}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-72 text-sm">
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
                          onClick={() => applyFilter({ kind: 'action', id: log.actionId })}
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
                  {page} / {lastPage}
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
