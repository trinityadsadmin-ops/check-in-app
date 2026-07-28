'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorBanner } from '@/components/data/error-banner'
import { TableSkeleton } from '@/components/data/table-skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LatLngNode } from '@/generated/api/model'
import { usePermissions } from '@/hooks/use-permissions'
import {
  createWorkLocation,
  listWorkLocationUsers,
  listWorkLocations,
  setUserWorkArea,
  unassignWorkLocationUser,
  updateWorkLocation
} from '@/lib/api/backoffice'
import { getErrorMessage } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n'
import { UserCombobox } from '../users/user-combobox'
import { getDefaultAreaNodes, MapAreaEditor } from './map-area-editor'

export function WorkAreasPage() {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const { has, permissions } = usePermissions()
  const canManageWorkAreas = has(permissions.workAreasManage)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createAreaNodes, setCreateAreaNodes] = useState<LatLngNode[]>(getDefaultAreaNodes())
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [locationName, setLocationName] = useState('')
  const [locationDescription, setLocationDescription] = useState('')
  const [areaNodes, setAreaNodes] = useState<LatLngNode[]>(getDefaultAreaNodes())
  const [selectedUserId, setSelectedUserId] = useState('')

  const locationsQuery = useQuery({
    queryKey: ['work-locations'],
    queryFn: listWorkLocations
  })
  const workLocations = useMemo(
    () =>
      (locationsQuery.data?.workLocations ?? []).filter(
        (location): location is NonNullable<typeof location> => location !== null
      ),
    [locationsQuery.data?.workLocations]
  )
  const selectedLocation = useMemo(
    () => workLocations.find((location) => location.id === selectedLocationId) ?? null,
    [selectedLocationId, workLocations]
  )
  const locationUsersQuery = useQuery({
    queryKey: ['work-location-users', selectedLocationId],
    queryFn: () => listWorkLocationUsers(selectedLocationId),
    enabled: Boolean(selectedLocationId)
  })
  const assignedUsers = locationUsersQuery.data?.users ?? []

  useEffect(() => {
    if (!selectedLocationId) {
      const firstActiveLocation = workLocations.find((location) => location.isActive)
      setSelectedLocationId(firstActiveLocation?.id ?? workLocations[0]?.id ?? '')
    }
  }, [selectedLocationId, workLocations])

  useEffect(() => {
    if (!selectedLocation) {
      return
    }

    setLocationName(selectedLocation.name)
    setLocationDescription(selectedLocation.description ?? '')
    setAreaNodes(selectedLocation.areaNodes)
    setSelectedUserId('')
  }, [selectedLocation])

  function showActionError(error: unknown) {
    toast.error(t('toast.actionFailed'), {
      description: getErrorMessage(error)
    })
  }

  const createLocationMutation = useMutation({
    mutationFn: () =>
      createWorkLocation({
        name: createName,
        ...(createDescription ? { description: createDescription } : {}),
        areaNodes: createAreaNodes,
        isActive: true
      }),
    onSuccess: (response) => {
      setCreateName('')
      setCreateDescription('')
      setCreateAreaNodes(getDefaultAreaNodes())
      setSelectedLocationId(response.workLocation.id)
      setIsCreateDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['work-locations'] })
      toast.success(t('workAreas.toastLocationCreated'))
    },
    onError: showActionError
  })
  const updateLocationMutation = useMutation({
    mutationFn: () =>
      updateWorkLocation(selectedLocationId, {
        name: locationName,
        description: locationDescription || null,
        areaNodes
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-locations'] })
      queryClient.invalidateQueries({ queryKey: ['work-location-users', selectedLocationId] })
      toast.success(t('workAreas.toastLocationUpdated'))
    },
    onError: showActionError
  })
  const toggleLocationMutation = useMutation({
    mutationFn: () =>
      updateWorkLocation(selectedLocationId, {
        isActive: !selectedLocation?.isActive
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-locations'] })
      toast.success(t('workAreas.toastLocationUpdated'))
    },
    onError: showActionError
  })
  const assignUserMutation = useMutation({
    mutationFn: () =>
      setUserWorkArea(selectedUserId, {
        workLocationId: selectedLocationId,
        isActive: true
      }),
    onSuccess: () => {
      setSelectedUserId('')
      queryClient.invalidateQueries({ queryKey: ['work-location-users', selectedLocationId] })
      toast.success(t('workAreas.toastUserAssigned'))
    },
    onError: showActionError
  })
  const unassignUserMutation = useMutation({
    mutationFn: (userId: string) => unassignWorkLocationUser(selectedLocationId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-location-users', selectedLocationId] })
      toast.success(t('workAreas.toastUserUnassigned'))
    },
    onError: showActionError
  })

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{t('workAreas.locationsTitle')}</CardTitle>
          {canManageWorkAreas ? (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button">
                  <Plus className="size-4" />
                  {t('workAreas.createLocation')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{t('workAreas.createLocation')}</DialogTitle>
                </DialogHeader>
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    createLocationMutation.mutate()
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="create-location-name">{t('workAreas.locationName')}</Label>
                      <Input
                        id="create-location-name"
                        value={createName}
                        onChange={(event) => setCreateName(event.target.value)}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="create-location-description">{t('common.description')}</Label>
                      <Input
                        id="create-location-description"
                        value={createDescription}
                        onChange={(event) => setCreateDescription(event.target.value)}
                      />
                    </div>
                  </div>
                  <MapAreaEditor value={createAreaNodes} onChange={setCreateAreaNodes} />
                  {createLocationMutation.isError ? (
                    <ErrorBanner error={createLocationMutation.error} />
                  ) : null}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline" disabled={createLocationMutation.isPending}>
                        {t('common.cancel')}
                      </Button>
                    </DialogClose>
                    <Button type="submit" disabled={createLocationMutation.isPending || !createName.trim()}>
                      <Plus className="size-4" />
                      {t('common.create')}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </CardHeader>
        <CardContent>
          {locationsQuery.isLoading ? <TableSkeleton rows={3} /> : null}
          {locationsQuery.isError ? <ErrorBanner error={locationsQuery.error} /> : null}
          {locationsQuery.data ? (
            workLocations.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.name')}</TableHead>
                    <TableHead>{t('common.description')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="w-28 text-right">{t('common.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workLocations.map((location) => (
                    <TableRow
                      key={location.id}
                      data-state={location.id === selectedLocationId ? 'selected' : undefined}
                    >
                      <TableCell className="font-medium">{location.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {location.description ?? '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={location.isActive ? 'outline' : 'secondary'}>
                          {location.isActive ? t('common.active') : t('common.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant={location.id === selectedLocationId ? 'secondary' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedLocationId(location.id)}
                        >
                          {t('workAreas.manageLocation')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState label={t('workAreas.emptyLocations')} />
            )
          ) : null}
        </CardContent>
      </Card>

      {selectedLocation ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="grid gap-1">
              <CardTitle>{selectedLocation.name}</CardTitle>
              {selectedLocation.description ? (
                <p className="text-sm text-muted-foreground">{selectedLocation.description}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={selectedLocation.isActive ? 'outline' : 'secondary'}>
                {selectedLocation.isActive ? t('common.active') : t('common.inactive')}
              </Badge>
              {canManageWorkAreas ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={toggleLocationMutation.isPending}
                  onClick={() => toggleLocationMutation.mutate()}
                >
                  {selectedLocation.isActive ? t('common.disable') : t('common.enable')}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="area" className="gap-5">
              <TabsList>
                <TabsTrigger value="area">{t('workAreas.areaTitle')}</TabsTrigger>
                <TabsTrigger value="employees">{t('workAreas.assignedEmployees')}</TabsTrigger>
              </TabsList>

              <TabsContent value="area" className="grid gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="location-name">{t('workAreas.locationName')}</Label>
                    <Input
                      id="location-name"
                      value={locationName}
                      disabled={!canManageWorkAreas}
                      onChange={(event) => setLocationName(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="location-description">{t('common.description')}</Label>
                    <Input
                      id="location-description"
                      value={locationDescription}
                      disabled={!canManageWorkAreas}
                      onChange={(event) => setLocationDescription(event.target.value)}
                    />
                  </div>
                </div>
                <MapAreaEditor
                  value={areaNodes}
                  onChange={setAreaNodes}
                  disabled={!canManageWorkAreas}
                />
                {updateLocationMutation.isError ? <ErrorBanner error={updateLocationMutation.error} /> : null}
                <div className="flex justify-end">
                  <Button
                    disabled={
                      !canManageWorkAreas ||
                      updateLocationMutation.isPending ||
                      !locationName.trim()
                    }
                    onClick={() => updateLocationMutation.mutate()}
                  >
                    <Save className="size-4" />
                    {t('common.save')}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="employees" className="grid gap-5">
                <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end">
                  <div className="grid w-full gap-2 sm:max-w-md">
                    <Label htmlFor="location-user">{t('common.employee')}</Label>
                    <UserCombobox
                      value={selectedUserId}
                      disabled={!canManageWorkAreas || !selectedLocation.isActive}
                      placeholder={t('workAreas.userSearchPlaceholder')}
                      onValueChange={setSelectedUserId}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={
                      !canManageWorkAreas ||
                      !selectedLocation.isActive ||
                      !selectedUserId ||
                      assignUserMutation.isPending
                    }
                    onClick={() => assignUserMutation.mutate()}
                  >
                    <Plus className="size-4" />
                    {t('workAreas.assignEmployee')}
                  </Button>
                </div>

                {locationUsersQuery.isLoading ? <TableSkeleton rows={3} /> : null}
                {locationUsersQuery.isError ? <ErrorBanner error={locationUsersQuery.error} /> : null}
                {assignUserMutation.isError ? <ErrorBanner error={assignUserMutation.error} /> : null}
                {unassignUserMutation.isError ? <ErrorBanner error={unassignUserMutation.error} /> : null}

                {locationUsersQuery.data ? (
                  assignedUsers.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {assignedUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {user.fullName ?? user.email ?? user.id}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {[user.employeeCode, user.email].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          {canManageWorkAreas ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={t('common.remove')}
                                  disabled={unassignUserMutation.isPending}
                                  onClick={() => unassignUserMutation.mutate(user.id)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('common.remove')}</TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label={t('workAreas.emptyAssignedEmployees')} />
                  )
                ) : null}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
