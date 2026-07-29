'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, RefreshCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorBanner } from '@/components/data/error-banner'
import { TableSkeleton } from '@/components/data/table-skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { EmergencyLogStatus } from '@/generated/api/model'
import { usePermissions } from '@/hooks/use-permissions'
import { listEmergencyLogs, updateEmergencyLog } from '@/lib/api/backoffice'
import { getErrorMessage } from '@/lib/api/errors'
import { translateStatusKey, useI18n } from '@/lib/i18n'

type EmergencyStatusFilter = '' | EmergencyLogStatus

function statusVariant(status: EmergencyLogStatus) {
  if (status === 'OPEN') {
    return 'destructive'
  }

  if (status === 'ACKNOWLEDGED') {
    return 'secondary'
  }

  return 'outline'
}

export function EmergencyPage() {
  const queryClient = useQueryClient()
  const { locale, t } = useI18n()
  const { has, permissions } = usePermissions()
  const canUpdateEmergency = has(permissions.emergencyUpdate)
  const [status, setStatus] = useState<EmergencyStatusFilter>('OPEN')
  const emergencyQuery = useQuery({
    queryKey: ['emergency-logs', { status }],
    queryFn: () =>
      listEmergencyLogs({
        page: 1,
        perPage: 50,
        ...(status ? { status } : {})
      })
  })
  const updateMutation = useMutation({
    mutationFn: (input: { id: string; status: EmergencyLogStatus }) =>
      updateEmergencyLog(input.id, { status: input.status }),
    onSuccess: (_response, input) => {
      queryClient.invalidateQueries({ queryKey: ['emergency-logs'] })
      toast.success(
        input.status === 'ACKNOWLEDGED'
          ? t('emergency.toastAcknowledged')
          : t('emergency.toastResolved')
      )
    },
    onError: (error) =>
      toast.error(t('toast.actionFailed'), {
        description: getErrorMessage(error)
      })
  })
  const logs = emergencyQuery.data?.emergencyLogs ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>{t('emergency.logsTitle')}</CardTitle>
          <div className="flex gap-2">
            <Select
              value={status || 'ALL'}
              onValueChange={(value) =>
                setStatus(value === 'ALL' ? '' : (value as EmergencyStatusFilter))
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('common.all')}</SelectItem>
                <SelectItem value="OPEN">{t('status.open')}</SelectItem>
                <SelectItem value="ACKNOWLEDGED">{t('status.acknowledged')}</SelectItem>
                <SelectItem value="RESOLVED">{t('status.resolved')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => emergencyQuery.refetch()}
              disabled={emergencyQuery.isFetching}
            >
              <RefreshCcw className="size-4" />
              {t('common.refresh')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {emergencyQuery.isLoading ? <TableSkeleton /> : null}
        {emergencyQuery.isError ? <ErrorBanner error={emergencyQuery.error} /> : null}
        {updateMutation.isError ? <ErrorBanner error={updateMutation.error} /> : null}

        {emergencyQuery.data ? (
          logs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('emergency.triggered')}</TableHead>
                  <TableHead>{t('common.employee')}</TableHead>
                  <TableHead>{t('common.type')}</TableHead>
                  <TableHead>{t('common.location')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="w-56 text-right">{t('common.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {new Date(log.triggeredAt).toLocaleString(locale)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {log.user?.fullName ?? log.user?.employeeCode ?? log.userId}
                      </div>
                      {log.user?.fullName && log.user.employeeCode ? (
                        <div className="text-xs text-muted-foreground">
                          {log.user.employeeCode}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div>{log.emergencyType ?? '-'}</div>
                      <div className="text-xs text-muted-foreground">{log.message ?? ''}</div>
                    </TableCell>
                    <TableCell>
                      <a
                        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                        href={`https://www.openstreetmap.org/?mlat=${log.lat}&mlon=${log.lng}#map=18/${log.lat}/${log.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {log.lat.toFixed(5)}, {log.lng.toFixed(5)}
                        <ExternalLink className="size-3" />
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(log.status)}>
                        {t(translateStatusKey(log.status))}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            updateMutation.isPending || log.status !== 'OPEN' || !canUpdateEmergency
                          }
                          onClick={() =>
                            updateMutation.mutate({
                              id: log.id,
                              status: 'ACKNOWLEDGED'
                            })
                          }
                        >
                          {t('emergency.ack')}
                        </Button>
                        <Button
                          size="sm"
                          disabled={
                            updateMutation.isPending ||
                            log.status === 'RESOLVED' ||
                            !canUpdateEmergency
                          }
                          onClick={() =>
                            updateMutation.mutate({
                              id: log.id,
                              status: 'RESOLVED'
                            })
                          }
                        >
                          {t('emergency.resolve')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label={t('emergency.empty')} />
          )
        ) : null}
      </CardContent>
    </Card>
  )
}
