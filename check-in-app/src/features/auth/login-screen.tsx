'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LoaderCircle, Lock, Mail, ShieldX, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api/fetch-client'
import { isDeviceBlockedError, useAuth } from '@/lib/auth/auth-provider'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { LangToggle } from './lang-toggle'

export function LoginScreen() {
  const { signIn, isAuthenticated, isLoading, blocked } = useAuth()
  const { t } = useI18n()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/')
    }
  }, [isAuthenticated, isLoading, router])

  // Surfaced when a 401 forced us here (session expired); show a notice + clean the URL.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const params = new URLSearchParams(window.location.search)
    if (params.get('session') === 'expired') {
      toast.error(t.session_expired)
      params.delete('session')
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (signingIn) {
      return
    }
    setSigningIn(true)
    try {
      await signIn({ email, password })
      router.replace('/')
    } catch (error) {
      if (isDeviceBlockedError(error)) {
        // `blocked` is now true; the blocked card renders. No toast needed.
        return
      }
      toast.error(resolveErrorMessage(error, t.invalid_credentials, t.login_failed))
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '96px 26px 30px',
        background: 'var(--trinity-bg)'
      }}
    >
      <img
        src="/logo/trinity-logo.png"
        alt="Trinity Marketing Services"
        style={{ width: '172px', height: 'auto', alignSelf: 'center' }}
      />

      <div style={{ marginTop: '26px', fontSize: '27px', fontWeight: 600, textAlign: 'center' }}>
        {t.login_title}
      </div>
      <div
        style={{
          marginTop: '6px',
          fontSize: '14px',
          color: 'var(--trinity-mfg)',
          textAlign: 'center'
        }}
      >
        {t.login_sub}
      </div>

      {blocked ? (
        <div
          style={{
            marginTop: '22px',
            border: '1px solid var(--trinity-danger-bd)',
            background: 'var(--trinity-danger-bg)',
            borderRadius: 'var(--trinity-radius)',
            padding: '13px 14px',
            display: 'flex',
            gap: '11px',
            animation: 'rm-pop .25s ease'
          }}
        >
          <ShieldX
            size={20}
            color="var(--trinity-danger)"
            style={{ flex: 'none', marginTop: '1px' }}
          />
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--trinity-danger)' }}>
              {t.blocked_title}
            </div>
            <div
              style={{
                fontSize: '12.5px',
                lineHeight: '18px',
                color: '#7a1414',
                marginTop: '3px'
              }}
            >
              {t.blocked_msg}
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: '26px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '7px' }}>
            {t.email_label}
          </div>
          <div style={fieldStyle}>
            <Mail size={18} color="var(--trinity-mfg2)" />
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t.email_ph}
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '7px' }}>
            {t.pass_label}
          </div>
          <div style={fieldStyle}>
            <Lock size={18} color="var(--trinity-mfg2)" />
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t.pass_ph}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={signingIn}
        style={{
          marginTop: '24px',
          height: '50px',
          borderRadius: '4px',
          background: 'var(--trinity-primary)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '9px',
          fontSize: '16px',
          fontWeight: 600,
          cursor: signingIn ? 'default' : 'pointer',
          border: 0,
          userSelect: 'none',
          transition: 'all .33s cubic-bezier(.5,0,0,.75)'
        }}
      >
        {signingIn ? (
          <LoaderCircle size={18} style={{ animation: 'rm-spin .8s linear infinite' }} />
        ) : null}
        <span style={{ whiteSpace: 'nowrap' }}>
          {signingIn ? t.login_loading : t.login_btn}
        </span>
      </button>

      <div
        style={{
          marginTop: '16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '9px',
          color: 'var(--trinity-mfg)'
        }}
      >
        <Smartphone size={15} style={{ marginTop: '2px', flex: 'none' }} />
        <div style={{ fontSize: '11.5px', lineHeight: '17px' }}>{t.device_bind_note}</div>
      </div>

      <div style={{ flex: 1 }} />

      <LangToggle />
    </form>
  )
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: '48px',
  border: '1px solid var(--trinity-border)',
  borderRadius: 'var(--trinity-radius)',
  background: '#fff',
  padding: '0 13px',
  gap: '10px'
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  border: 0,
  outline: 0,
  background: 'transparent',
  fontSize: '15px',
  fontFamily: 'inherit',
  color: 'var(--trinity-fg)'
}

function resolveErrorMessage(error: unknown, invalid: string, generic: string): string {
  if (error instanceof ApiError) {
    const payload = error.payload as { error?: { message?: string } } | null
    if (error.status === 401 || error.status === 400) {
      return payload?.error?.message ?? invalid
    }
    return payload?.error?.message ?? generic
  }
  return generic
}
