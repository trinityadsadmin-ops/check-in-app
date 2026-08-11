'use client'

import { MapPinOff, RotateCw } from 'lucide-react'
import { detectGeoPlatform } from '@/lib/geo/platform'
import { useI18n } from '@/lib/i18n/i18n-provider'

type Props = {
  onRetry: () => void
}

/** Denied-permission panel: explains why location is needed and how to re-enable it. */
export function LocationPermissionHelp({ onRetry }: Props) {
  const { t } = useI18n()
  const platform = detectGeoPlatform()
  const steps =
    platform === 'ios'
      ? t.geo_denied_steps_ios
      : platform === 'android'
        ? t.geo_denied_steps_android
        : t.geo_denied_steps_desktop

  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid var(--trinity-danger-bd)',
        background: 'var(--trinity-danger-bg)',
        borderRadius: 8,
        padding: '11px 12px'
      }}
    >
      <div className="flex items-center" style={{ gap: 8 }}>
        <MapPinOff size={16} color="var(--trinity-danger)" style={{ flex: 'none' }} />
        <div style={{ fontSize: 13, fontWeight: 600 }}>{t.geo_denied_help_title}</div>
      </div>
      <div style={{ fontSize: 12, lineHeight: '17px', color: 'var(--trinity-mfg)', marginTop: 6 }}>
        {t.geo_denied_help_body}
      </div>
      <div style={{ fontSize: 12, lineHeight: '17px', marginTop: 6 }}>{steps}</div>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center justify-center"
        style={{
          marginTop: 10,
          height: 36,
          width: '100%',
          borderRadius: 4,
          border: '1px solid var(--trinity-danger-bd)',
          background: '#fff',
          color: 'var(--trinity-danger)',
          fontSize: 13,
          fontWeight: 600,
          gap: 6
        }}
      >
        <RotateCw size={14} />
        {t.geo_retry}
      </button>
    </div>
  )
}

export default LocationPermissionHelp
