'use client'

import { Building2, X } from 'lucide-react'
import { useGetFrontendWorkAreas } from '@/generated/api/frontend/frontend'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useShell } from '@/lib/shell/shell-provider'

/**
 * Bottom-sheet listing every work site the employee is currently assigned to
 * (same data `HomeScreen` uses to pick the nearest site badge). Opened from
 * the "view all sites" button next to that badge.
 */
export function SiteListSheet() {
  const { t } = useI18n()
  const { sites } = useShell()
  const workAreasQuery = useGetFrontendWorkAreas()
  const assignments = workAreasQuery.data?.workAreas ?? []

  if (!sites.open) {
    return null
  }

  return (
    <div className="absolute inset-0 flex flex-col justify-end" style={{ zIndex: 80 }}>
      <button
        type="button"
        aria-label={t.cancel}
        onClick={sites.close}
        className="absolute inset-0"
        style={{ background: 'rgba(8,12,20,.5)', animation: 'rm-fade .2s ease' }}
      />
      <div
        className="rm-scroll relative"
        style={{
          background: '#fff',
          borderRadius: '8px 12px 0 0',
          padding: '18px 18px 26px',
          animation: 'rm-sheet .28s cubic-bezier(.16,1,.3,1)',
          maxHeight: '80%',
          overflowY: 'auto'
        }}
      >
        <div className="flex items-center justify-between">
          <div style={{ fontSize: 18, fontWeight: 600 }}>{t.sites_sheet_title}</div>
          <button
            type="button"
            aria-label={t.cancel}
            onClick={sites.close}
            className="flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--trinity-muted)',
              color: 'var(--trinity-mfg)'
            }}
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex flex-col" style={{ marginTop: 14, gap: 10 }}>
          {workAreasQuery.isLoading ? (
            <div style={{ fontSize: 12.5, color: 'var(--trinity-mfg)', textAlign: 'center', padding: '16px 0' }}>
              {t.loading}
            </div>
          ) : assignments.length === 0 ? (
            <div
              style={{
                border: '1px solid var(--trinity-border)',
                borderRadius: 8,
                padding: '16px 13px',
                fontSize: 12.5,
                color: 'var(--trinity-mfg)',
                textAlign: 'center'
              }}
            >
              {t.sites_sheet_empty}
            </div>
          ) : (
            assignments.map(({ workArea, workLocation }) => (
              <div
                key={workArea.id}
                className="flex items-center"
                style={{
                  gap: 12,
                  border: '1px solid var(--trinity-border)',
                  borderRadius: 8,
                  padding: '12px 13px'
                }}
              >
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    background: 'var(--trinity-primary-l)',
                    flex: 'none'
                  }}
                >
                  <Building2 size={18} color="var(--trinity-primary)" />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{workLocation.name}</div>
                  {workLocation.description ? (
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--trinity-mfg)',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {workLocation.description}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default SiteListSheet
