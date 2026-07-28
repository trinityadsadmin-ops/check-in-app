'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPinned, Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorBanner } from '@/components/data/error-banner'
import { TableSkeleton } from '@/components/data/table-skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
import { ApiError, getApiErrorCode } from '@/lib/api/fetch-json'
import { getErrorMessage } from '@/lib/api/errors'
import type { BackofficeUser, UserPermissionOverride } from '@/generated/api/model'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useI18n } from '@/lib/i18n'
import { hasEveryPermission, hasPermission, permissions as permissionKeys } from '@/lib/permissions'
import {
  createUser,
  getUserEffectivePermissions,
  getUserWorkArea,
  listPermissions,
  listRoles,
  listUsers,
  listWorkLocations,
  resetUserDevice,
  setUserPermissionOverrides,
  updateUser
} from '@/lib/api/backoffice'
import { getAuthMe } from '@/lib/api/auth'
import { UserCombobox } from './user-combobox'
import { MapAreaEditor } from '../work-areas/map-area-editor'

type UsersTab = 'list' | 'permissions'

function showActionError(
  title: string,
  error: unknown,
  resolveErrorCode: (code: string) => string | undefined
) {
  toast.error(title, {
    description: getErrorMessage(error, resolveErrorCode)
  })
}

export function UsersTable() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { locale, t } = useI18n()
  const resolveErrorCode = (code: string) => {
    const key = `errors.${code}`
    const message = t(key)

    return message === key ? undefined : message
  }
  const [search, setSearch] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [roleId, setRoleId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [viewedWorkAreaUser, setViewedWorkAreaUser] = useState<BackofficeUser | null>(null)
  const [isPermissionPickerOpen, setIsPermissionPickerOpen] = useState(false)
  const [permissionSearch, setPermissionSearch] = useState('')
  const [grantedPermissionKeys, setGrantedPermissionKeys] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<UsersTab>('list')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [userPage, setUserPage] = useState(1)
  const [usersPerPage, setUsersPerPage] = useState(20)
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const profileQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: getAuthMe,
    retry: false
  })
  const currentUser = profileQuery.data?.user
  const canReadUsers = hasPermission(currentUser, permissionKeys.usersRead)
  const canOpenCreateUsers = hasPermission(currentUser, permissionKeys.usersCreate)
  const canCreateUsers = hasEveryPermission(currentUser, [
    permissionKeys.usersCreate,
    permissionKeys.rolesRead,
    permissionKeys.rolesAssign
  ])
  const canReadRoles = hasPermission(currentUser, permissionKeys.rolesRead)
  const canAssignRoles = hasPermission(currentUser, permissionKeys.rolesAssign)
  const canUpdateUsers = hasPermission(currentUser, permissionKeys.usersUpdate)
  const canResetDevice = hasPermission(currentUser, permissionKeys.usersResetDevice)
  const canReadPermissions = hasPermission(currentUser, permissionKeys.permissionsRead)
  const canUpdatePermissions = hasPermission(currentUser, permissionKeys.permissionsUpdate)
  const canReadWorkAreas = hasPermission(currentUser, permissionKeys.workAreasRead)
  const availableTabs = useMemo<UsersTab[]>(() => {
    const tabs: UsersTab[] = []

    if (canReadUsers) {
      tabs.push('list')
    }

    if (canReadPermissions) {
      tabs.push('permissions')
    }

    return tabs
  }, [canOpenCreateUsers, canReadPermissions, canReadUsers])
  const query = useQuery({
    queryKey: ['backoffice-users', { page: userPage, perPage: usersPerPage, search: debouncedSearch }],
    queryFn: () =>
      listUsers({
        page: userPage,
        perPage: usersPerPage,
        ...(debouncedSearch ? { search: debouncedSearch } : {})
      }),
    enabled: canReadUsers
  })
  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: listRoles,
    enabled: canReadRoles
  })
  const permissionsQuery = useQuery({
    queryKey: ['permissions'],
    queryFn: listPermissions,
    enabled: canReadPermissions
  })
  const effectivePermissionsQuery = useQuery({
    queryKey: ['user-effective-permissions', selectedUserId],
    queryFn: () => getUserEffectivePermissions(selectedUserId),
    enabled: Boolean(selectedUserId) && canReadPermissions
  })
  const userWorkAreaQuery = useQuery({
    queryKey: ['user-work-area', viewedWorkAreaUser?.id],
    queryFn: () => getUserWorkArea(viewedWorkAreaUser?.id ?? ''),
    enabled: Boolean(viewedWorkAreaUser) && canReadWorkAreas
  })
  const workLocationsQuery = useQuery({
    queryKey: ['work-locations'],
    queryFn: listWorkLocations,
    enabled: Boolean(viewedWorkAreaUser) && canReadWorkAreas
  })
  const createMutation = useMutation({
    mutationFn: () =>
      createUser({
        email,
        password,
        roleId,
        isActive: true,
        ...(fullName ? { fullName } : {}),
        ...(employeeCode ? { employeeCode } : {})
      }),
    onSuccess: () => {
      setEmail('')
      setPassword('')
      setFullName('')
      setEmployeeCode('')
      setIsCreateDialogOpen(false)
      setActiveTab('list')
      setUserPage(1)
      queryClient.invalidateQueries({ queryKey: ['backoffice-users'] })
      toast.success(t('users.toastCreated'))
    },
    onError: (error) => showActionError(t('toast.actionFailed'), error, resolveErrorCode)
  })
  const updateMutation = useMutation({
    mutationFn: (input: { userId: string; roleId?: string; isActive?: boolean }) =>
      updateUser(input.userId, {
        ...(input.roleId ? { roleId: input.roleId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
      }),
    onSuccess: (_response, input) => {
      queryClient.invalidateQueries({ queryKey: ['backoffice-users'] })
      queryClient.invalidateQueries({ queryKey: ['user-effective-permissions', input.userId] })
      toast.success(t('users.toastUpdated'))
    },
    onError: (error) => showActionError(t('toast.actionFailed'), error, resolveErrorCode)
  })
  const resetMutation = useMutation({
    mutationFn: (userId: string) => resetUserDevice(userId, t('audit.resetDeviceReason')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backoffice-users'] })
      toast.success(t('users.toastDeviceReset'))
    },
    onError: (error) => showActionError(t('toast.actionFailed'), error, resolveErrorCode)
  })
  const saveOverridesMutation = useMutation({
    mutationFn: () => {
      const currentPermissions = effectivePermissionsQuery.data?.permissions ?? []
      const grantedKeys = new Set(grantedPermissionKeys)
      const overrides: UserPermissionOverride[] = currentPermissions
        .map((permission) => {
          const shouldGrant = grantedKeys.has(permission.permission.key)

          if (permission.roleGranted && !shouldGrant) {
            return { permissionKey: permission.permission.key, effect: 'DENY' as const }
          }

          if (!permission.roleGranted && shouldGrant) {
            return { permissionKey: permission.permission.key, effect: 'ALLOW' as const }
          }

          return null
        })
        .filter((override): override is UserPermissionOverride => override !== null)

      return setUserPermissionOverrides(selectedUserId, { overrides })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-effective-permissions', selectedUserId] })
      toast.success(t('users.toastPermissionsSaved'))
    },
    onError: (error) => showActionError(t('toast.actionFailed'), error, resolveErrorCode)
  })

  const users = useMemo(() => query.data?.users ?? [], [query.data?.users])
  const totalUsers = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalUsers / usersPerPage))
  const rangeStart = totalUsers === 0 ? 0 : (userPage - 1) * usersPerPage + 1
  const rangeEnd = Math.min(userPage * usersPerPage, totalUsers)
  const roles = useMemo(() => rolesQuery.data?.roles ?? [], [rolesQuery.data?.roles])
  const permissions = useMemo(
    () => permissionsQuery.data?.permissions ?? [],
    [permissionsQuery.data?.permissions]
  )
  const permissionByKey = useMemo(
    () => new Map(permissions.map((permission) => [permission.key, permission])),
    [permissions]
  )
  const viewedWorkLocation = useMemo(() => {
    const workLocationId = userWorkAreaQuery.data?.workArea?.workLocationId

    if (!workLocationId) {
      return null
    }

    return (
      workLocationsQuery.data?.workLocations.find((location) => location.id === workLocationId) ?? null
    )
  }, [userWorkAreaQuery.data?.workArea?.workLocationId, workLocationsQuery.data?.workLocations])
  const availablePermissions = useMemo(
    () => permissions.filter((permission) => !grantedPermissionKeys.includes(permission.key)),
    [grantedPermissionKeys, permissions]
  )
  const filteredAvailablePermissions = useMemo(() => {
    const searchValue = permissionSearch.trim().toLowerCase()

    if (!searchValue) {
      return availablePermissions
    }

    return availablePermissions.filter(
      (permission) =>
        permission.key.toLowerCase().includes(searchValue) ||
        permission.name.toLowerCase().includes(searchValue)
    )
  }, [availablePermissions, permissionSearch])
  const employeeCodeError =
    createMutation.isError && getApiErrorCode(createMutation.error) === 'EMPLOYEE_CODE_ALREADY_EXISTS'
      ? resolveErrorCode('EMPLOYEE_CODE_ALREADY_EXISTS')
      : undefined
  const hasPermissionChanges = useMemo(() => {
    const savedPermissionKeys =
      effectivePermissionsQuery.data?.permissions
        .filter((permission) => permission.granted)
        .map((permission) => permission.permission.key)
        .sort() ?? []

    return (
      savedPermissionKeys.length !== grantedPermissionKeys.length ||
      savedPermissionKeys.some((permissionKey, index) => permissionKey !== grantedPermissionKeys[index])
    )
  }, [effectivePermissionsQuery.data?.permissions, grantedPermissionKeys])
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      router.replace('/login')
    }
  }, [query.error, router])

  useEffect(() => {
    if (!profileQuery.data) {
      return
    }

    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] ?? 'list')
    }
  }, [activeTab, availableTabs, profileQuery.data])

  useEffect(() => {
    setUserPage(1)
  }, [debouncedSearch, usersPerPage])

  useEffect(() => {
    if (!roleId && roles[0]) {
      setRoleId(roles[0].id)
    }
  }, [roleId, roles])

  useEffect(() => {
    setGrantedPermissionKeys(
      effectivePermissionsQuery.data?.permissions
        .filter((permission) => permission.granted)
        .map((permission) => permission.permission.key) ?? []
    )
  }, [effectivePermissionsQuery.data?.permissions])

  function addPermission(permissionKeyToAdd: string) {
    setGrantedPermissionKeys((current) =>
      current.includes(permissionKeyToAdd) ? current : [...current, permissionKeyToAdd].sort()
    )
    setIsPermissionPickerOpen(false)
    setPermissionSearch('')
  }

  function removePermission(permissionKeyToRemove: string) {
    setGrantedPermissionKeys((current) =>
      current.filter((currentPermissionKey) => currentPermissionKey !== permissionKeyToRemove)
    )
  }

  if (profileQuery.data && availableTabs.length === 0) {
    return <EmptyState label={t('common.noAccess')} />
  }

  return (
    <>
    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as UsersTab)}
        className="gap-6"
      >
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            {canReadUsers ? <TabsTrigger value="list">{t('users.tabList')}</TabsTrigger> : null}
            {canReadPermissions ? (
              <TabsTrigger value="permissions">{t('users.tabPermissions')}</TabsTrigger>
            ) : null}
          </TabsList>
          {canOpenCreateUsers ? (
            <DialogTrigger asChild>
              <Button type="button">
                <Plus className="size-4" />
                {t('users.tabCreate')}
              </Button>
            </DialogTrigger>
          ) : null}
        </div>

      {canReadUsers ? (
      <TabsContent value="list">
        <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>{t('users.title')}</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder={t('users.searchPlaceholder')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Select
                value={String(usersPerPage)}
                onValueChange={(value) => setUsersPerPage(Number(value))}
              >
                <SelectTrigger className="w-full md:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / {t('users.page')}</SelectItem>
                  <SelectItem value="20">20 / {t('users.page')}</SelectItem>
                  <SelectItem value="50">50 / {t('users.page')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? <TableSkeleton /> : null}

          {query.isError ? <ErrorBanner error={query.error} /> : null}

          {query.data ? (
            users.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.employee')}</TableHead>
                    <TableHead>{t('common.role')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('common.created')}</TableHead>
                    <TableHead className="w-80 text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const isCurrentUser = user.id === profileQuery.data?.user.id

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="font-medium">{user.fullName ?? user.email ?? user.id}</div>
                          <div className="text-xs text-muted-foreground">
                            {user.employeeCode ?? t('common.noEmployeeCode')} · {user.email ?? t('common.noEmail')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.role.id}
                            disabled={updateMutation.isPending || isCurrentUser || !canAssignRoles}
                            onValueChange={(value) =>
                              updateMutation.mutate({
                                userId: user.id,
                                roleId: value
                              })
                            }
                          >
                            <SelectTrigger title={isCurrentUser ? t('users.selfRoleLocked') : undefined}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((role) => (
                                <SelectItem key={role.id} value={role.id}>
                                  {role.key}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 hover:bg-transparent"
                            disabled={updateMutation.isPending || !canUpdateUsers}
                            onClick={() =>
                              updateMutation.mutate({
                                userId: user.id,
                                isActive: !user.isActive
                              })
                            }
                          >
                            <Badge variant={user.isActive ? 'outline' : 'destructive'}>
                              {user.isActive ? t('common.active') : t('common.inactive')}
                            </Badge>
                          </Button>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.createdAt ? new Date(user.createdAt).toLocaleString(locale) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canReadWorkAreas ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setViewedWorkAreaUser(user)}
                              >
                                <MapPinned className="size-4" />
                                {t('users.viewWorkLocation')}
                              </Button>
                            ) : null}
                            {canReadPermissions ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedUserId(user.id)
                                  setActiveTab('permissions')
                                }}
                              >
                                {t('common.permissions')}
                              </Button>
                            ) : null}
                            {canResetDevice ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={resetMutation.isPending}
                                onClick={() => resetMutation.mutate(user.id)}
                              >
                                <RotateCcw className="size-4" />
                                {t('common.reset')}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState label={t('users.empty')} />
            )
          ) : null}
          {query.data ? (
            <div className="mt-4 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-muted-foreground">
                {rangeStart}-{rangeEnd} / {totalUsers}
              </div>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={userPage <= 1 || query.isFetching}
                      className={
                        userPage <= 1 || query.isFetching
                          ? 'pointer-events-none opacity-50'
                          : undefined
                      }
                      onClick={(event) => {
                        event.preventDefault()
                        setUserPage((current) => Math.max(1, current - 1))
                      }}
                    >
                      {t('common.previous')}
                    </PaginationPrevious>
                  </PaginationItem>
                  <PaginationItem>
                    <span className="block min-w-24 text-center text-sm text-muted-foreground">
                      {t('users.page')} {userPage} / {totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={userPage >= totalPages || query.isFetching}
                      className={
                        userPage >= totalPages || query.isFetching
                          ? 'pointer-events-none opacity-50'
                          : undefined
                      }
                      onClick={(event) => {
                        event.preventDefault()
                        setUserPage((current) => Math.min(totalPages, current + 1))
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
      </TabsContent>
      ) : null}

      {canReadPermissions ? (
      <TabsContent value="permissions">
        <Card>
        <CardHeader className="gap-4">
          <CardTitle>{t('users.effectivePermissions')}</CardTitle>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="permission-user">{t('common.user')}</Label>
            <UserCombobox
              value={selectedUserId}
              selectedUser={effectivePermissionsQuery.data?.user}
              disabled={!canReadUsers}
              placeholder={t('users.selectUser')}
              onValueChange={setSelectedUserId}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {effectivePermissionsQuery.isLoading ? <TableSkeleton rows={4} /> : null}
          {effectivePermissionsQuery.isError ? (
            <ErrorBanner error={effectivePermissionsQuery.error} />
          ) : null}
          {!selectedUserId ? <EmptyState label={t('users.emptyPermissions')} /> : null}

          {effectivePermissionsQuery.data ? (
            <>
              <div className="flex flex-col gap-3 border-y py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline">
                    {effectivePermissionsQuery.data.user.role.key}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {grantedPermissionKeys.length} {t('users.permissionsAssigned')}
                  </span>
                </div>
                <Popover open={isPermissionPickerOpen} onOpenChange={setIsPermissionPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !canUpdatePermissions ||
                        availablePermissions.length === 0 ||
                        saveOverridesMutation.isPending
                      }
                    >
                      <Plus className="size-4" />
                      {t('common.add')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="end">
                    <Command shouldFilter={false}>
                      <CommandInput
                        value={permissionSearch}
                        placeholder={t('users.permission')}
                        onValueChange={setPermissionSearch}
                      />
                      <CommandList>
                        <CommandEmpty>{t('users.noPermissionsToAdd')}</CommandEmpty>
                        <CommandGroup>
                          {filteredAvailablePermissions.map((permission) => (
                            <CommandItem
                              key={permission.id}
                              value={permission.key}
                              onSelect={() => addPermission(permission.key)}
                            >
                              <span className="grid min-w-0 gap-0.5">
                                <span className="truncate">{permission.name}</span>
                                <span className="truncate font-mono text-xs text-muted-foreground">
                                  {permission.key}
                                </span>
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {grantedPermissionKeys.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {grantedPermissionKeys.map((grantedPermissionKey) => {
                    const permission = permissionByKey.get(grantedPermissionKey)

                    return (
                      <div
                        key={grantedPermissionKey}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{permission?.name ?? '-'}</div>
                          <div className="truncate font-mono text-xs text-muted-foreground">
                            {grantedPermissionKey}
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t('common.remove')}
                              disabled={!canUpdatePermissions || saveOverridesMutation.isPending}
                              onClick={() => removePermission(grantedPermissionKey)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('common.remove')}</TooltipContent>
                        </Tooltip>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState label={t('users.noGrantedPermissions')} />
              )}

              {saveOverridesMutation.isError ? <ErrorBanner error={saveOverridesMutation.error} /> : null}

              <div className="flex justify-end border-t pt-4">
                <Button
                  disabled={
                    saveOverridesMutation.isPending || !canUpdatePermissions || !hasPermissionChanges
                  }
                  onClick={() => saveOverridesMutation.mutate()}
                >
                  <Save className="size-4" />
                  {t('users.savePermissions')}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
        </Card>
      </TabsContent>
      ) : null}
      </Tabs>

      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('users.createTitle')}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            createMutation.mutate()
          }}
        >
          {!canCreateUsers ? (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{t('users.missingCreatePermissions')}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="create-user-email">{t('auth.email')}</Label>
            <Input
              id="create-user-email"
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-user-password">{t('users.temporaryPassword')}</Label>
            <Input
              id="create-user-password"
              type="password"
              placeholder={t('users.temporaryPassword')}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-user-role">{t('common.role')}</Label>
            <Select value={roleId} onValueChange={setRoleId} disabled={!canAssignRoles}>
              <SelectTrigger id="create-user-role">
                <SelectValue placeholder={t('common.role')} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-user-full-name">{t('users.fullName')}</Label>
            <Input
              id="create-user-full-name"
              placeholder={t('users.fullName')}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="create-user-employee-code">{t('users.employeeCode')}</Label>
            <Input
              id="create-user-employee-code"
              placeholder={t('users.employeeCode')}
              value={employeeCode}
              aria-invalid={Boolean(employeeCodeError)}
              onChange={(event) => {
                setEmployeeCode(event.target.value)
                createMutation.reset()
              }}
            />
            {employeeCodeError ? (
              <p className="text-sm text-destructive" role="alert">
                {employeeCodeError}
              </p>
            ) : null}
          </div>
          {createMutation.isError && !employeeCodeError ? (
            <div className="sm:col-span-2">
              <ErrorBanner
                error={createMutation.error}
                message={getErrorMessage(createMutation.error, resolveErrorCode)}
              />
            </div>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={createMutation.isPending}>
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={createMutation.isPending || !roleId || !canCreateUsers}>
              <Plus className="size-4" />
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog
      open={Boolean(viewedWorkAreaUser)}
      onOpenChange={(open) => {
        if (!open) {
          setViewedWorkAreaUser(null)
        }
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('users.viewWorkLocation')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1">
            <div className="font-medium">
              {viewedWorkAreaUser?.fullName ?? viewedWorkAreaUser?.email ?? '-'}
            </div>
            <div className="text-sm text-muted-foreground">
              {[viewedWorkAreaUser?.employeeCode, viewedWorkAreaUser?.email]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>

          {userWorkAreaQuery.isLoading || workLocationsQuery.isLoading ? (
            <TableSkeleton rows={3} />
          ) : null}
          {userWorkAreaQuery.isError ? <ErrorBanner error={userWorkAreaQuery.error} /> : null}
          {workLocationsQuery.isError ? <ErrorBanner error={workLocationsQuery.error} /> : null}

          {userWorkAreaQuery.data && workLocationsQuery.data ? (
            userWorkAreaQuery.data.workArea && viewedWorkLocation ? (
              <>
                <div className="grid gap-1 rounded-md border p-4">
                  <div className="text-sm text-muted-foreground">
                    {t('users.assignedWorkLocation')}
                  </div>
                  <div className="font-medium">{viewedWorkLocation.name}</div>
                  {viewedWorkLocation.description ? (
                    <div className="text-sm text-muted-foreground">
                      {viewedWorkLocation.description}
                    </div>
                  ) : null}
                </div>
                <MapAreaEditor
                  value={userWorkAreaQuery.data.workArea.areaNodes}
                  onChange={() => undefined}
                  disabled
                />
              </>
            ) : (
              <EmptyState label={t('workAreas.emptyUserArea')} />
            )
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('common.cancel')}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
