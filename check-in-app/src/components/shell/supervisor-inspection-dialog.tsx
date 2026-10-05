'use client'

import { Check, Loader2 } from 'lucide-react'
import { useState } from 'react'
import {
  INSPECTION_POSITIONS,
  INSPECTION_SLOTS,
  isInspectionComplete,
  type InspectionPosition,
  type InspectionSelection,
  type InspectionSlot
} from '@/features/attendance/supervisor-inspection'
import { useI18n } from '@/lib/i18n/i18n-provider'

/**
 * Supervisor check-in pop-up: pick one or more inspected staff positions, and
 * one or more inspection times for each. Shown over the check-in sheet after
 * Confirm; the check-in is only sent once this is submitted. The parent mounts
 * it only while open, so each opening starts with an empty selection.
 */
export function SupervisorInspectionDialog({
  submitting,
  onCancel,
  onSubmit
}: {
  submitting: boolean
  onCancel: () => void
  onSubmit: (selection: InspectionSelection) => void
}) {
  const { t } = useI18n()
  const [selection, setSelection] = useState<InspectionSelection>({})

  const togglePosition = (position: InspectionPosition) => {
    setSelection((current) => {
      const next = { ...current }
      if (next[position]) {
        delete next[position]
      } else {
        next[position] = []
      }
      return next
    })
  }

  const toggleSlot = (position: InspectionPosition, slot: InspectionSlot) => {
    setSelection((current) => {
      const slots = current[position] ?? []
      return {
        ...current,
        [position]: slots.includes(slot) ? slots.filter((s) => s !== slot) : [...slots, slot]
      }
    })
  }

  const complete = isInspectionComplete(selection)
  const canSubmit = complete && !submitting

  return (
    <div className="absolute inset-0 flex items-end justify-center" style={{ zIndex: 90 }}>
      <button
        type="button"
        aria-label={t.cancel}
        onClick={submitting ? undefined : onCancel}
        className="absolute inset-0"
        style={{ background: 'rgba(8,12,20,.45)', animation: 'rm-fade .2s ease' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspection-title"
        className="rm-scroll relative w-full"
        style={{
          background: '#fff',
          borderRadius: '8px 12px 0 0',
          padding: '18px 18px 26px',
          maxHeight: '88%',
          overflowY: 'auto',
          animation: 'rm-sheet .28s cubic-bezier(.16,1,.3,1)'
        }}
      >
        <div id="inspection-title" style={{ fontSize: 18, fontWeight: 600 }}>
          {t.inspection_title}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--trinity-mfg)', marginTop: 4 }}>
          {t.inspection_sub}
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--trinity-mfg)', marginTop: 16 }}>
          {t.inspection_positions}
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          {INSPECTION_POSITIONS.map(({ value: position, label }) => {
            const slots = selection[position]
            const selected = slots !== undefined

            return (
              <div
                key={position}
                style={{
                  border: `1px solid ${selected ? 'var(--trinity-primary)' : 'var(--trinity-border)'}`,
                  background: selected ? 'var(--trinity-success-bg)' : '#fff',
                  borderRadius: 8,
                  overflow: 'hidden'
                }}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => togglePosition(position)}
                  className="flex w-full items-center"
                  style={{ gap: 10, padding: '12px 13px', fontSize: 15, fontWeight: 600, textAlign: 'left' }}
                >
                  <span
                    className="flex items-center justify-center"
                    aria-hidden
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      border: `1.5px solid ${selected ? 'var(--trinity-primary)' : 'var(--trinity-border2)'}`,
                      background: selected ? 'var(--trinity-primary)' : '#fff',
                      flex: 'none'
                    }}
                  >
                    {selected ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                  </span>
                  {label}
                </button>

                {selected ? (
                  <div style={{ padding: '0 13px 13px' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--trinity-mfg)', marginBottom: 7 }}>
                      {t.inspection_times}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                      {INSPECTION_SLOTS.map(({ value: slot, labelKey }) => {
                        const active = slots.includes(slot)
                        return (
                          <button
                            key={slot}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleSlot(position, slot)}
                            style={{
                              height: 40,
                              borderRadius: 6,
                              fontSize: 13.5,
                              fontWeight: 600,
                              border: `1px solid ${active ? 'var(--trinity-primary)' : 'var(--trinity-border)'}`,
                              background: active ? 'var(--trinity-primary)' : '#fff',
                              color: active ? '#fff' : 'inherit'
                            }}
                          >
                            {t[labelKey]}
                          </button>
                        )
                      })}
                    </div>
                    {slots.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: 'var(--trinity-danger)', marginTop: 7 }}>
                        {t.inspection_pick_time}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex flex-1 items-center justify-center"
            style={{
              height: 50,
              borderRadius: 4,
              border: '1px solid var(--trinity-border)',
              fontSize: 15,
              fontWeight: 600,
              background: '#fff'
            }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => onSubmit(selection)}
            disabled={!canSubmit}
            className="flex items-center justify-center"
            style={{
              flex: 1.5,
              height: 50,
              borderRadius: 4,
              background: 'var(--trinity-primary)',
              color: '#fff',
              gap: 8,
              fontSize: 15,
              fontWeight: 600,
              opacity: canSubmit ? 1 : 0.6
            }}
          >
            {submitting ? (
              <Loader2 size={19} style={{ animation: 'rm-spin 1s linear infinite' }} />
            ) : (
              <Check size={19} />
            )}
            {t.confirm_in}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SupervisorInspectionDialog
