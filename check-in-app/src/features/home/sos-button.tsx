'use client'

import { BellRing, X } from 'lucide-react'
import { useShell } from '@/lib/shell/shell-provider'

/**
 * Floating SOS trigger shown only on Home. Toggles the SOS panel (built by the
 * emergency screen and mounted by the integrate phase). Mirrors the prototype's
 * bottom-right danger button.
 */
export function SosButton() {
  const { sos } = useShell()

  return (
    <button
      type="button"
      onClick={sos.toggle}
      aria-label="SOS"
      className="absolute flex flex-col items-center justify-center"
      style={{
        right: 16,
        bottom: 'calc(120px + env(safe-area-inset-bottom, 0px))',
        zIndex: 79,
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'var(--trinity-danger)',
        border: '4px solid #fff',
        color: '#fff',
        boxShadow: '0 6px 18px rgba(200,16,46,.42)',
        userSelect: 'none'
      }}
    >
      {sos.open ? <X size={22} /> : <BellRing size={22} />}
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '.5px', marginTop: 1 }}>SOS</span>
    </button>
  )
}
