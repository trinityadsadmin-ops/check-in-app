'use client'

import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarCheck,
  Camera,
  CircleDollarSign,
  ClipboardList,
  LogOut,
  MapPinned,
  Users
} from 'lucide-react'
import Link from 'next/link'
import type { Route } from 'next'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { EmptyState } from '@/components/data/empty-state'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from '@/components/ui/sidebar'
import { ApiError } from '@/lib/api/fetch-json'
import { getAuthMe } from '@/lib/api/auth'
import { clearStoredSession, getStoredSession } from '@/lib/api/session'
import { useI18n } from '@/lib/i18n'
import { hasPermission, permissions } from '@/lib/permissions'

const navigation = [
  {
    labelKey: 'nav.users',
    href: '/dashboard/users',
    icon: Users,
    permission: permissions.usersRead
  },
  {
    labelKey: 'nav.workLocations',
    href: '/dashboard/work-areas',
    icon: MapPinned,
    permission: permissions.workAreasRead
  },
  {
    labelKey: 'nav.attendance',
    href: '/dashboard/attendance',
    icon: CalendarCheck,
    permission: permissions.attendanceRead
  },
  {
    labelKey: 'nav.areaInspections',
    href: '/dashboard/area-inspections',
    icon: Camera,
    permission: permissions.areaInspectionsRead
  },
  {
    labelKey: 'nav.emergency',
    href: '/dashboard/emergency',
    icon: AlertTriangle,
    permission: permissions.emergencyRead
  },
  {
    labelKey: 'nav.salary',
    href: '/dashboard/salary',
    icon: CircleDollarSign,
    permission: permissions.salaryRead
  },
  {
    labelKey: 'nav.logs',
    href: '/dashboard/logs',
    icon: ClipboardList,
    permission: permissions.logsRead
  }
] as const

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useI18n()
  const profileQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: getAuthMe,
    retry: false
  })

  useEffect(() => {
    if (!getStoredSession()) {
      router.replace('/login')
    }
  }, [router])

  useEffect(() => {
    if (profileQuery.error instanceof ApiError && profileQuery.error.status === 401) {
      clearStoredSession()
      router.replace('/login')
    }
  }, [profileQuery.error, router])

  function handleSignOut() {
    clearStoredSession()
    router.replace('/login')
  }

  const visibleNavigation = navigation.filter((item) =>
    hasPermission(profileQuery.data?.user, item.permission)
  )
  const currentNavigationItem = navigation.find((item) => pathname === item.href)
  const canAccessCurrentRoute =
    !currentNavigationItem || hasPermission(profileQuery.data?.user, currentNavigationItem.permission)
  const shouldCheckRoutePermission = Boolean(currentNavigationItem)

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="h-14 flex-row items-center gap-2 border-b px-4 py-0">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Users className="size-4" />
          </div>
          <span className="text-sm font-semibold">Check-in</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNavigation.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname === item.href}>
                      <Link href={item.href as Route}>
                        <item.icon className="size-4" />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <span className="text-sm font-medium">
              {profileQuery.data?.user.fullName ??
                profileQuery.data?.user.email ??
                t('shell.backoffice')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">{t('nav.signOut')}</span>
            </Button>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
          {shouldCheckRoutePermission && profileQuery.isLoading ? (
            <EmptyState label={t('common.loading')} />
          ) : canAccessCurrentRoute ? (
            children
          ) : (
            <EmptyState label={t('common.noAccess')} />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
