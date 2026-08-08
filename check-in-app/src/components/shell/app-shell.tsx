'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Camera, Clock, FileText, House, LayoutGrid, Settings, X } from 'lucide-react'
import type { Route } from 'next'
import { usePathname, useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useShell } from '@/lib/shell/shell-provider'
import { cn } from '@/lib/utils'
import { SosButton } from '@/features/home/sos-button'
import { PullToRefresh } from './pull-to-refresh'

/**
 * Shared chrome for every `(app)` route: status-aware header, the scrollable
 * content region (children = the route page), the 2-tab bottom nav with a center
 * speed-dial FAB, and mount points for overlays.
 *
 * App-shell renders `{children}` — it never imports screen page components. The
 * heavy overlays (check-in sheet, SOS panel, active alert, etc.) are passed in
 * via the `overlays` slot by the `(app)` layout once those components exist, so
 * the shell stays decoupled from screens that are built later.
 */
export function AppShell({
  children,
  overlays
}: {
  children: React.ReactNode
  overlays?: React.ReactNode
}) {
  const { t } = useI18n()
  const { online, fontScale, fab } = useShell()
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Pull-to-refresh refetches the active screen's data (all live queries).
  const handleRefresh = () => queryClient.invalidateQueries()

  const onHome = pathname === '/'

  const titleByPath: Record<string, string> = {
    '/': t.tab_home,
    '/attendance': t.tab_attend,
    '/capture': t.tab_capture,
    '/payslip': t.tab_payslip,
    '/settings': t.tab_settings
  }
  const screenTitle = titleByPath[pathname] ?? t.tab_home

  const navItems = [
    { href: '/', icon: House, label: t.tab_home },
    { href: '/attendance', icon: Clock, label: t.tab_attend }
  ]

  const fabItems = [
    { href: '/capture', icon: Camera, label: t.tab_capture },
    { href: '/payslip', icon: FileText, label: t.tab_payslip },
    { href: '/settings', icon: Settings, label: t.tab_settings }
  ]

  const navColor = (href: string) =>
    pathname === href ? 'var(--trinity-primary)' : 'var(--trinity-mfg2)'

  const go = (href: string) => {
    fab.close()
    // Routes are created by later screen builders; cast for typedRoutes.
    router.push(href as Route)
  }

  const netColor = online ? 'var(--trinity-success)' : 'var(--trinity-warn)'
  const netLabel = online ? t.net_online : t.net_offline

  return (
    <div
      className="relative flex h-full w-full flex-col"
      style={{ background: 'var(--trinity-muted2)' }}
    >
      {/* header */}
      <div
        className="flex items-center gap-3"
        style={{
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 22px 14px',
          background: '#fff',
          borderBottom: '1px solid var(--trinity-border)'
        }}
      >
        <div
          className="flex-1"
          style={{ fontSize: 20, fontWeight: 600, color: 'var(--trinity-fg)' }}
        >
          {screenTitle}
        </div>
        {onHome ? (
          <div
            className="flex items-center gap-1.5"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: netColor,
              border: '1px solid var(--trinity-border)',
              borderRadius: 4,
              padding: '5px 10px'
            }}
          >
            <span
              style={{ width: 7, height: 7, borderRadius: '50%', background: netColor }}
              aria-hidden
            />
            {netLabel}
          </div>
        ) : null}
      </div>

      {/* scroll content — pull-to-refresh; fontScale applied as zoom */}
      <PullToRefresh className="rm-scroll" style={{ zoom: fontScale }} onRefresh={handleRefresh}>
        {children}
      </PullToRefresh>

      {/* floating SOS — home only, anchored to the shell (above the bottom nav),
          so it stays put while the content scrolls */}
      {onHome ? <SosButton /> : null}

      {/* speed-dial overlay (core navigation, lives in the shell) */}
      {fab.open ? (
        <div className="absolute inset-0" style={{ zIndex: 70 }}>
          <button
            type="button"
            aria-label="Close menu"
            onClick={fab.close}
            className="absolute inset-0"
            style={{ background: 'rgba(8,12,20,.42)', animation: 'rm-fade .2s ease' }}
          />
          <div
            className="absolute left-0 right-0 flex flex-col items-center gap-3"
            style={{ bottom: 108 }}
          >
            {fabItems.map((item) => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => go(item.href)}
                  className="flex items-center gap-3"
                  style={{ animation: 'rm-pop .22s ease both', cursor: 'pointer' }}
                >
                  <span
                    style={{
                      background: '#fff',
                      padding: '7px 13px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  >
                    {item.label}
                  </span>
                  <span
                    className="flex items-center justify-center"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: active ? 'var(--trinity-primary)' : '#fff',
                      border: `1px solid ${active ? 'var(--trinity-primary)' : 'var(--trinity-border)'}`
                    }}
                  >
                    <Icon size={21} color={active ? '#fff' : 'var(--trinity-primary)'} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* bottom nav (2 tabs + center FAB) */}
      <div
        className="relative flex items-center justify-between"
        style={{
          zIndex: 75,
          background: '#fff',
          borderTop: '1px solid var(--trinity-border)',
          padding: '10px 38px calc(22px + env(safe-area-inset-bottom, 0px))'
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => go(item.href)}
              className="flex flex-col items-center gap-1 py-1.5"
              style={{ width: 58, color: navColor(item.href) }}
            >
              <Icon size={22} />
              <span style={{ fontSize: 10, fontWeight: 600 }}>{item.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={fab.toggle}
          aria-label={fab.open ? 'Close menu' : 'Open menu'}
          className={cn('absolute left-1/2 flex items-center justify-center')}
          style={{
            top: -22,
            transform: 'translateX(-50%)',
            width: 58,
            height: 58,
            borderRadius: '50%',
            background: 'var(--trinity-primary)',
            border: '4px solid #fff'
          }}
        >
          {fab.open ? <X size={25} color="#fff" /> : <LayoutGrid size={25} color="#fff" />}
        </button>
      </div>

      {/* overlay mount point — heavier overlays (sheet, sos, alert) are supplied
          by the (app) layout via this slot once those components are built. */}
      {overlays}
    </div>
  )
}
