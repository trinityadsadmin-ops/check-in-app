'use client'

import { Camera, ChevronRight, FileText, LogIn, LogOut } from 'lucide-react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import {
  useGetFrontendProfile,
  useGetFrontendWorkAreas,
  useListFrontendAttendance
} from '@/generated/api/frontend/frontend'
import { useAuth } from '@/lib/auth/auth-provider'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useShell } from '@/lib/shell/shell-provider'
import {
  deriveTodayStatus,
  findTodayDay,
  fmtTime,
  isCheckedInNow,
  isInside,
  sortDaysDesc,
  toRows
} from '@/features/attendance/attendance-utils'
import { HistoryRow } from '@/features/attendance/history-row'

function initialsOf(name: string | null | undefined): string {
  if (!name) return 'TA'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'TA'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function HomeScreen() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { openCheckIn, openCheckOut } = useShell()
  const router = useRouter()

  const profileQuery = useGetFrontendProfile()
  const attendanceQuery = useListFrontendAttendance({ perPage: 30 })
  const workAreasQuery = useGetFrontendWorkAreas()

  const profileUser = profileQuery.data?.user ?? user
  const days = attendanceQuery.data?.attendanceDays ?? []
  const sorted = sortDaysDesc(days)

  const status = deriveTodayStatus(days)
  // Action availability tracks the *current* state, so users can check in/out
  // multiple times a day: show Check Out while checked in, Check In otherwise.
  const isCheckedIn = isCheckedInNow(days)
  const notCheckedIn = !isCheckedIn

  const empName = profileUser?.fullName ?? 'Trinity Staff'
  const empId = profileUser?.employeeCode ?? '—'
  const empRole = profileUser?.role?.name ?? t.tab_home
  const initials = initialsOf(profileUser?.fullName)

  // Site label: the first assigned work location's name (staff work-areas endpoint),
  // falling back to the most recent work-area id from history, else a placeholder.
  const today = findTodayDay(days)
  const siteShort =
    workAreasQuery.data?.workAreas[0]?.workLocation.name ??
    today?.checkIn?.workAreaSnapshot?.workLocationId ??
    t.site_label

  // status pill tokens
  const statusText =
    status === 'checked-out' ? t.checked_out : isCheckedIn ? t.checked_in : t.not_checked
  const settled = status !== 'not-checked-in'
  const statusFg = settled ? 'var(--trinity-success)' : 'var(--trinity-mfg)'
  const statusBg = settled ? 'var(--trinity-success-bg)' : 'var(--trinity-muted)'
  const statusBd = settled ? 'var(--trinity-success-bd)' : 'var(--trinity-border)'

  // last-check text — prefer the latest event of the day
  const lastEvent = today?.checkOut ?? today?.checkIn ?? null
  const lastCheckText = lastEvent
    ? `${today?.checkOut ? t.last_check_out : t.last_check} · ${fmtTime(
        lastEvent.capturedAt,
        lang
      )} · ${isInside(lastEvent) ? t.tag_in : t.tag_out}`
    : t.not_checked

  const recent = toRows(sorted.slice(0, 2), lang, {
    recIn: t.rec_in,
    recOut: t.rec_out,
    today: t.today,
    yesterday: t.yesterday,
    tagIn: t.tag_in,
    tagOut: t.tag_out
  }).slice(0, 2)

  const go = (href: string) => router.push(href as Route)

  return (
    <div
      className="relative flex flex-col"
      style={{ padding: '18px 18px 96px', gap: 14 }}
    >
      {/* employee card */}
      <div style={{ background: 'var(--trinity-house)', borderRadius: 10, padding: 18, color: '#fff' }}>
        <div className="flex items-center" style={{ gap: 12 }}>
          <div
            className="flex items-center justify-center"
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              background: 'rgba(255,255,255,.16)',
              fontWeight: 600,
              fontSize: 16
            }}
          >
            {initials}
          </div>
          <div className="flex-1">
            <div style={{ fontSize: 16, fontWeight: 600 }}>{empName}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {empId} · {empRole}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 15, display: 'flex', gap: 10 }}>
          <div
            className="flex-1"
            style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '10px 12px' }}
          >
            <div style={{ fontSize: 11, opacity: 0.78 }}>{t.site_label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{siteShort}</div>
          </div>
        </div>
      </div>

      {/* check-in status card */}
      <div
        style={{
          background: '#fff',
          border: '1px solid var(--trinity-border)',
          borderRadius: 10,
          padding: 15
        }}
      >
        <div className="flex items-center justify-between">
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.attend_status}</div>
          <div
            className="inline-flex items-center"
            style={{
              gap: 6,
              height: 26,
              padding: '0 10px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              background: statusBg,
              color: statusFg,
              border: `1px solid ${statusBd}`
            }}
          >
            <span
              style={{ width: 7, height: 7, borderRadius: '50%', background: statusFg }}
              aria-hidden
            />
            {statusText}
          </div>
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--trinity-mfg)' }}>
          {attendanceQuery.isLoading ? t.loading : lastCheckText}
        </div>
        <div style={{ marginTop: 13, display: 'flex', gap: 10 }}>
          {notCheckedIn ? (
            <button
              type="button"
              onClick={openCheckIn}
              className="flex flex-1 items-center justify-center"
              style={{
                height: 46,
                borderRadius: 4,
                background: 'var(--trinity-primary)',
                color: '#fff',
                gap: 8,
                fontSize: 14,
                fontWeight: 600,
                userSelect: 'none'
              }}
            >
              <LogIn size={18} />
              {t.check_in}
            </button>
          ) : null}
          {isCheckedIn ? (
            <button
              type="button"
              onClick={openCheckOut}
              className="flex flex-1 items-center justify-center"
              style={{
                height: 46,
                borderRadius: 4,
                background: '#fff',
                border: '1px solid var(--trinity-primary)',
                color: 'var(--trinity-fg)',
                gap: 8,
                fontSize: 14,
                fontWeight: 600,
                userSelect: 'none'
              }}
            >
              <LogOut size={18} />
              {t.check_out}
            </button>
          ) : null}
        </div>
      </div>

      {/* quick actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        {(
          [
            { href: '/capture', icon: Camera, label: t.tab_capture, hint: t.capture_hint_card },
            { href: '/payslip', icon: FileText, label: t.tab_payslip, hint: t.payslip_hint_card }
          ] as const
        ).map(({ href, icon: Icon, label, hint }) => (
          <button
            key={href}
            type="button"
            onClick={() => go(href)}
            className="flex flex-1 flex-col"
            style={{
              background: '#fff',
              border: '1px solid var(--trinity-border)',
              borderRadius: 10,
              padding: '15px 12px',
              gap: 9,
              textAlign: 'left'
            }}
          >
            <div
              className="flex items-center justify-center"
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'var(--trinity-primary-l)'
              }}
            >
              <Icon size={20} color="var(--trinity-primary)" />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--trinity-mfg)', lineHeight: '15px' }}>
              {hint}
            </div>
          </button>
        ))}
      </div>

      {/* recent history */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        <div className="flex items-center justify-between">
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--trinity-mfg)',
              textTransform: 'uppercase',
              letterSpacing: '.5px'
            }}
          >
            {t.history}
          </div>
          <button
            type="button"
            onClick={() => go('/attendance')}
            className="flex items-center"
            style={{ gap: 2, fontSize: 12, fontWeight: 600, color: 'var(--trinity-primary)' }}
          >
            {t.view_all}
            <ChevronRight size={15} />
          </button>
        </div>
        {recent.length === 0 ? (
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--trinity-border)',
              borderRadius: 8,
              padding: '16px 13px',
              fontSize: 12.5,
              color: 'var(--trinity-mfg)',
              textAlign: 'center'
            }}
          >
            {attendanceQuery.isLoading ? t.loading : t.empty_history}
          </div>
        ) : (
          recent.map((row) => <HistoryRow key={row.id} row={row} size="sm" />)
        )}
      </div>
    </div>
  )
}
