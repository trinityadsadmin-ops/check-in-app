'use client'

import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorBanner } from '@/components/data/error-banner'
import { TableSkeleton } from '@/components/data/table-skeleton'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { listAuditLogs, listEventLogs } from '@/lib/api/backoffice'
import { useI18n } from '@/lib/i18n'

export function LogsPage() {
  const { locale, t } = useI18n()
  const auditQuery = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => listAuditLogs({ page: 1, perPage: 50 })
  })
  const eventQuery = useQuery({
    queryKey: ['event-logs'],
    queryFn: () => listEventLogs({ page: 1, perPage: 50 })
  })
  const auditLogs = auditQuery.data?.auditLogs ?? []
  const eventLogs = eventQuery.data?.eventLogs ?? []

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('logs.auditTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {auditQuery.isLoading ? <TableSkeleton rows={4} /> : null}
          {auditQuery.isError ? <ErrorBanner error={auditQuery.error} /> : null}
          {auditQuery.data ? (
            auditLogs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.created')}</TableHead>
                    <TableHead>{t('logs.action')}</TableHead>
                    <TableHead>{t('common.resource')}</TableHead>
                    <TableHead>{t('common.actor')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{new Date(log.createdAt).toLocaleString(locale)}</TableCell>
                      <TableCell className="font-medium">{log.action}</TableCell>
                      <TableCell>
                        {log.resourceType}
                        {log.resourceId ? (
                          <span className="block font-mono text-xs text-muted-foreground">
                            {log.resourceId}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {log.actor?.fullName ?? log.actor?.employeeCode ?? log.actorUserId ?? '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState label={t('logs.emptyAudit')} />
            )
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('logs.eventTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {eventQuery.isLoading ? <TableSkeleton rows={4} /> : null}
          {eventQuery.isError ? <ErrorBanner error={eventQuery.error} /> : null}
          {eventQuery.data ? (
            eventLogs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.created')}</TableHead>
                    <TableHead>{t('common.event')}</TableHead>
                    <TableHead>{t('common.severity')}</TableHead>
                    <TableHead>{t('common.resource')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{new Date(log.createdAt).toLocaleString(locale)}</TableCell>
                      <TableCell className="font-medium">{log.eventType}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.severity === 'ERROR'
                              ? 'destructive'
                              : log.severity === 'WARN'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {log.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.resourceType ?? '-'}
                        {log.resourceId ? (
                          <span className="block font-mono text-xs text-muted-foreground">
                            {log.resourceId}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState label={t('logs.emptyEvent')} />
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
