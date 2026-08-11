'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type GeoCoords = {
  lat: number
  lng: number
  /** Accuracy radius in metres, when reported by the device. */
  accuracy?: number
}

export type GeoStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'error'

export type UseGeolocationResult = {
  coords: GeoCoords | null
  status: GeoStatus
  /**
   * Known permission state from the Permissions API, checked without prompting.
   * 'unsupported' means the browser can't report this ahead of time (e.g. iOS
   * Safari) — status only becomes 'denied' there once `request()` is actually
   * rejected.
   */
  permission: 'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported'
  /** Requests a single fresh position fix. No-ops (sets status 'denied') if permission is already known-denied. */
  request: () => void
}

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
}

/**
 * Thin wrapper over `navigator.geolocation.getCurrentPosition`. Returns the last
 * fix plus a coarse status the check-in sheet can render directly. Also checks
 * the Permissions API (where supported) so callers can detect a denied
 * permission — and react to it being re-granted — without firing a doomed
 * browser prompt.
 */
export function useGeolocation(options: PositionOptions = DEFAULT_OPTIONS): UseGeolocationResult {
  const [coords, setCoords] = useState<GeoCoords | null>(null)
  const [status, setStatus] = useState<GeoStatus>('idle')
  const [permission, setPermission] = useState<UseGeolocationResult['permission']>('unknown')
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      setPermission('unsupported')
      return
    }
    let cancelled = false
    let statusRef: PermissionStatus | null = null

    const onChange = () => {
      if (!statusRef) return
      setPermission(statusRef.state)
      if (statusRef.state === 'denied') {
        setStatus('denied')
      }
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (cancelled) return
        statusRef = result
        setPermission(result.state)
        if (result.state === 'denied') {
          setStatus('denied')
        }
        result.addEventListener('change', onChange)
      })
      .catch(() => {
        if (!cancelled) setPermission('unsupported')
      })

    return () => {
      cancelled = true
      statusRef?.removeEventListener('change', onChange)
    }
  }, [])

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error')
      return
    }
    if (permission === 'denied') {
      setStatus('denied')
      return
    }

    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        })
        setStatus('ok')
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error')
      },
      optionsRef.current
    )
  }, [permission])

  return { coords, status, permission, request }
}
