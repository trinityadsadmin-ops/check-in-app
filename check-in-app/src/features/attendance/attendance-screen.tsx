'use client'

import { LogIn, LogOut } from 'lucide-react'
import { useListFrontendAttendance } from '@/generated/api/frontend/frontend'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useShell } from '@/lib/shell/shell-provider'
import { isCheckedInNow, sortDaysDesc, toRows } from './attendance-utils'
import { HistoryRow } from './history-row'

export function AttendanceScreen() {
  const { t, lang } = useI18n()
  const { openCheckIn, openCheckOut } = useShell()

  const attendanceQuery = useListFrontendAttendance({ perPage: 60 })
  const days = attendanceQuery.data?.attendanceDays ?? []

  // Action availability tracks the current state — users may check in/out
  // multiple times a day, so always offer the next valid action.
  const isCheckedIn = isCheckedInNow(days)
  const notCheckedIn = !isCheckedIn

  const rows = toRows(sortDaysDesc(days), lang, {
    recIn: t.rec_in,
    recOut: t.rec_out,
    today: t.today,
    yesterday: t.yesterday,
    tagIn: t.tag_in,
    tagOut: t.tag_out
  })

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '18px 18px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        <div className="flex flex-col" style={{ gap: 10 }}>
          {rows.length === 0 ? (
            <div
              style={{
                background: '#fff',
                border: '1px solid var(--trinity-border)',
                borderRadius: 8,
                padding: '20px 14px',
                fontSize: 13,
                color: 'var(--trinity-mfg)',
                textAlign: 'center'
              }}
            >
              {attendanceQuery.isLoading ? t.loading : t.empty_history}
            </div>
          ) : (
            rows.map((row) => <HistoryRow key={row.id} row={row} size="md" />)
          )}
        </div>
      </div>

      {/* sticky bottom action bar */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          marginTop: 'auto',
          background: '#fff',
          borderTop: '1px solid var(--trinity-border)',
          padding: '12px 18px calc(36px + env(safe-area-inset-bottom))',
          display: 'flex',
          gap: 10,
          zIndex: 5
        }}
      >
        {notCheckedIn ? (
          <button
            type="button"
            onClick={() => openCheckIn()}
            className="flex flex-1 items-center justify-center"
            style={{
              height: 50,
              borderRadius: 4,
              background: 'var(--trinity-primary)',
              color: '#fff',
              gap: 8,
              fontSize: 15,
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
            onClick={() => openCheckOut()}
            className="flex flex-1 items-center justify-center"
            style={{
              height: 50,
              borderRadius: 4,
              background: '#fff',
              border: '1px solid var(--trinity-primary)',
              color: 'var(--trinity-primary)',
              gap: 8,
              fontSize: 15,
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
  )
}
