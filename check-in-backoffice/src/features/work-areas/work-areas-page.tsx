'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorBanner } from '@/components/data/error-banner'
import { TableSkeleton } from '@/components/data/table-skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LatLngNode } from '@/generated/api/model'
import { usePermissions } from '@/hooks/use-permissions'
import {
  createWorkLocation,
  getUserWorkArea,
  listWorkLocationUsers,
  listWorkLocations,
  setUserWorkArea,
  unassignWorkLocationUser,
  updateWorkLocation
} from '@/lib/api/backoffice'
import { getErrorMessage } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { UserCombobox } from '../users/user-combobox'
import { getDefaultAreaNodes, MapAreaEditor } from './map-area-editor'

export function WorkAreasPage() {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const { has, permissions } = usePermissions()
  const canManageWorkAreas = has(permissions.workAreasManage)
  const resolveErrorCode = (code: string) => {
    const key = `errors.${code}`
    const message = t(key)

    return message === key ? undefined : message
  }
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createAreaNodes, setCreateAreaNodes] = useState<LatLngNode[]>(getDefaultAreaNodes())
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [isManageSheetOpen, setIsManageSheetOpen] = useState(false)
  const [isDisableConfirmOpen, setIsDisableConfirmOpen] = useState(false)
  const [locationName, setLocationName] = useState('')
  const [locationDescription, setLocationDescription] = useState('')
  const [areaNodes, setAreaNodes] = useState<LatLngNode[]>(getDefaultAreaNodes())
  const [selectedUserId, setSelectedUserId] = useState('')
  const [isReassignConfirmOpen, setIsReassignConfirmOpen] = useState(false)

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
  const selectedUserWorkAreaQuery = useQuery({
    queryKey: ['user-work-area', selectedUserId],
    queryFn: () => getUserWorkArea(selectedUserId),
    enabled: Boolean(selectedUserId)
  })
  const selectedUserCurrentLocation = useMemo(() => {
    const workLocationId = selectedUserWorkAreaQuery.data?.workArea?.workLocationId

    return workLocationId ? workLocations.find((location) => location.id === workLocationId) ?? null : null
  }, [selectedUserWorkAreaQuery.data?.workArea?.workLocationId, workLocations])

  useEffect(() => {
    if (!selectedLocation) {
      return
    }

    setLocationName(selectedLocation.name)
    setLocationDescription(selectedLocation.description ?? '')
    setAreaNodes(selectedLocation.areaNodes)
    setSelectedUserId('')
  }, [selectedLocation])

  function handleCancelAreaEdits() {
    if (!selectedLocation) {
      return
    }

    setLocationName(selectedLocation.name)
    setLocationDescription(selectedLocation.description ?? '')
    setAreaNodes(selectedLocation.areaNodes)
  }

  function showActionError(error: unknown) {
    toast.error(t('toast.actionFailed'), {
      description: getErrorMessage(error, resolveErrorCode)
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
    mutationFn: ({
      allowReassignment,
      previousWorkLocationId
    }: {
      allowReassignment: boolean
      previousWorkLocationId?: string
    }) =>
      setUserWorkArea(selectedUserId, {
        workLocationId: selectedLocationId,
        isActive: true,
        allowReassignment
      }),
    onSuccess: (_response, variables) => {
      setSelectedUserId('')
      setIsReassignConfirmOpen(false)
      queryClient.invalidateQueries({ queryKey: ['work-location-users', selectedLocationId] })
      if (variables.previousWorkLocationId) {
        queryClient.invalidateQueries({
          queryKey: ['work-location-users', variables.previousWorkLocationId]
        })
      }
      queryClient.invalidateQueries({ queryKey: ['user-work-area'] })
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

  function handleAssignUser() {
    const currentWorkArea = selectedUserWorkAreaQuery.data?.workArea

    if (!currentWorkArea || currentWorkArea.workLocationId === selectedLocationId) {
      assignUserMutation.mutate({ allowReassignment: false })
      return
    }

    setIsReassignConfirmOpen(true)
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{t('workAreas.locationsTitle')}</CardTitle>
          {canManageWorkAreas ? (
            <Sheet open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <SheetTrigger asChild>
                <Button type="button">
                  <Plus className="size-4" />
                  {t('workAreas.createLocation')}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-[80vw]"
              >
                <SheetHeader className="pr-8 text-left">
                  <SheetTitle>{t('workAreas.createLocation')}</SheetTitle>
                </SheetHeader>
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    createLocationMutation.mutate()
                  }}
                >
                  <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                    <div className="grid content-start gap-4">
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
                        <Textarea
                          id="create-location-description"
                          value={createDescription}
                          onChange={(event) => setCreateDescription(event.target.value)}
                        />
                      </div>
                    </div>
                    <MapAreaEditor value={createAreaNodes} onChange={setCreateAreaNodes} />
                  </div>
                  {createLocationMutation.isError ? (
                    <ErrorBanner error={createLocationMutation.error} />
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={createLocationMutation.isPending}
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button type="submit" disabled={createLocationMutation.isPending || !createName.trim()}>
                      <Plus className="size-4" />
                      {t('common.create')}
                    </Button>
                  </div>
                </form>
              </SheetContent>
            </Sheet>
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
                          onClick={() => {
                            setSelectedLocationId(location.id)
                            setIsManageSheetOpen(true)
                          }}
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

      <Sheet
        open={isManageSheetOpen}
        onOpenChange={(open) => {
          setIsManageSheetOpen(open)
          if (!open) {
            setSelectedLocationId('')
          }
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-[80vw]"
        >
          {selectedLocation ? (
            <>
              <SheetHeader className="pr-8 text-left">
                <SheetTitle>{selectedLocation.name}</SheetTitle>
                {selectedLocation.description ? (
                  <SheetDescription>{selectedLocation.description}</SheetDescription>
                ) : null}
              </SheetHeader>
              <Tabs defaultValue="area" className="gap-5">
                <TabsList>
                  <TabsTrigger value="area">{t('workAreas.areaTitle')}</TabsTrigger>
                  <TabsTrigger value="employees">{t('workAreas.assignedEmployees')}</TabsTrigger>
                </TabsList>

                <TabsContent value="area" className="grid gap-5">
                  <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                    <div className="grid content-start gap-4">
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
                        <Textarea
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
                  </div>
                  {updateLocationMutation.isError ? (
                    <ErrorBanner error={updateLocationMutation.error} />
                  ) : null}
                  <div className="flex items-center justify-between">
                    {canManageWorkAreas ? (
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          selectedLocation.isActive &&
                            'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive'
                        )}
                        disabled={toggleLocationMutation.isPending}
                        onClick={() => {
                          if (selectedLocation.isActive) {
                            setIsDisableConfirmOpen(true)
                          } else {
                            toggleLocationMutation.mutate()
                          }
                        }}
                      >
                        {selectedLocation.isActive ? t('common.disable') : t('common.enable')}
                      </Button>
                    ) : (
                      <div />
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={updateLocationMutation.isPending}
                        onClick={() => {
                          handleCancelAreaEdits()
                          setIsManageSheetOpen(false)
                        }}
                      >
                        {t('common.cancel')}
                      </Button>
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
                        selectedUserWorkAreaQuery.isLoading ||
                        selectedUserWorkAreaQuery.data?.workArea?.workLocationId === selectedLocationId ||
                        assignUserMutation.isPending
                      }
                      onClick={handleAssignUser}
                    >
                      <Plus className="size-4" />
                      {t('workAreas.assignEmployee')}
                    </Button>
                  </div>

                  {selectedUserCurrentLocation &&
                  selectedUserCurrentLocation.id !== selectedLocationId ? (
                    <Alert>
                      <AlertDescription>
                        {t('workAreas.reassignmentNotice')} {selectedUserCurrentLocation.name}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {locationUsersQuery.isLoading ? <TableSkeleton rows={3} /> : null}
                  {locationUsersQuery.isError ? <ErrorBanner error={locationUsersQuery.error} /> : null}
                  {assignUserMutation.isError ? (
                    <ErrorBanner
                      error={assignUserMutation.error}
                      message={getErrorMessage(assignUserMutation.error, resolveErrorCode)}
                    />
                  ) : null}
                  {unassignUserMutation.isError ? (
                    <ErrorBanner error={unassignUserMutation.error} />
                  ) : null}

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
              <AlertDialog open={isDisableConfirmOpen} onOpenChange={setIsDisableConfirmOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('workAreas.confirmDisableTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('workAreas.confirmDisableDescription')} {selectedLocation.name}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => toggleLocationMutation.mutate()}>
                      {t('common.disable')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog open={isReassignConfirmOpen} onOpenChange={setIsReassignConfirmOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('workAreas.confirmReassignmentTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('workAreas.confirmReassignmentDescription')}{' '}
                      {selectedUserCurrentLocation?.name ?? '-'} {t('workAreas.toLocation')}{' '}
                      {selectedLocation.name}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={assignUserMutation.isPending}
                      onClick={() =>
                        assignUserMutation.mutate({
                          allowReassignment: true,
                          ...(selectedUserCurrentLocation
                            ? { previousWorkLocationId: selectedUserCurrentLocation.id }
                            : {})
                        })
                      }
                    >
                      {t('workAreas.confirmReassignment')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
