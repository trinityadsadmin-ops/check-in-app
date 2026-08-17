'use client'

import { LogIn, LogOut } from 'lucide-react'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { fmtDuration, type AttendanceRow } from './attendance-utils'

/**
 * One attendance activity row (check-in or check-out). Shared by the Home recent
 * list and the full Attendance history so both render identically. `size`
 * nudges the paddings to match the slightly larger Attendance variant.
 */
export function HistoryRow({ row, size = 'sm' }: { row: AttendanceRow; size?: 'sm' | 'md' }) {
  const { lang } = useI18n()
  const Icon = row.isCheckIn ? LogIn : LogOut
  const iconBg = row.isCheckIn ? 'var(--trinity-primary-l)' : 'var(--trinity-muted)'
  const iconFg = row.isCheckIn ? 'var(--trinity-primary)' : 'var(--trinity-mfg)'
  const tagBg = row.inside ? 'var(--trinity-success-bg)' : 'var(--trinity-danger-bg)'
  const tagFg = row.inside ? 'var(--trinity-success)' : 'var(--trinity-danger)'
  const md = size === 'md'

  return (
    <div
      className="flex items-center"
      style={{
        gap: md ? 13 : 12,
        background: '#fff',
        border: '1px solid var(--trinity-border)',
        borderRadius: 8,
        padding: md ? '13px 14px' : '12px 13px'
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: md ? 40 : 38,
          height: md ? 40 : 38,
          borderRadius: 8,
          background: iconBg,
          flex: 'none'
        }}
      >
        <Icon size={md ? 19 : 18} color={iconFg} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: md ? 14 : 13.5, fontWeight: 600 }}>{row.label}</div>
        <div
          style={{
            fontSize: md ? 11.5 : 11,
            color: 'var(--trinity-mfg)',
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {row.meta}
          {row.workLocationName ? ` · ${row.workLocationName}` : ''}
          {row.durationSeconds !== null ? ` · ${fmtDuration(row.durationSeconds, lang)}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div
          style={{ fontSize: md ? 15 : 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
        >
          {row.time}
        </div>
        <div
          className="inline-flex items-center"
          style={{
            gap: 4,
            marginTop: 3,
            fontSize: md ? 10.5 : 10,
            fontWeight: 600,
            padding: md ? '2px 7px' : '2px 6px',
            borderRadius: 6,
            background: tagBg,
            color: tagFg
          }}
        >
          <span
            style={{ width: 5, height: 5, borderRadius: '50%', background: tagFg }}
            aria-hidden
          />
          {row.tag}
        </div>
      </div>
    </div>
  )
}
