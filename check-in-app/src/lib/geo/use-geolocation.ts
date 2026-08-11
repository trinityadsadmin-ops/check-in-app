'use client'

import { useCallback, useRef, useState } from 'react'

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
  /** Requests a single fresh position fix. */
  request: () => void
}

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
}

/**
 * Thin wrapper over `navigator.geolocation.getCurrentPosition`. Returns the last
 * fix plus a coarse status the check-in sheet can render directly.
 *
 * Deliberately does not consult the Permissions API to pre-empt a "denied"
 * state: on Safari/WebKit that cached state is known to go stale and its
 * `change` event often doesn't fire after the user re-grants access from
 * Settings, which would leave callers permanently stuck showing "denied" even
 * after permission is genuinely restored. `status` always reflects the real
 * outcome of the most recent `request()` call instead.
 */
export function useGeolocation(options: PositionOptions = DEFAULT_OPTIONS): UseGeolocationResult {
  const [coords, setCoords] = useState<GeoCoords | null>(null)
  const [status, setStatus] = useState<GeoStatus>('idle')
  const optionsRef = useRef(options)
  optionsRef.current = options

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error')
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
  }, [])

  return { coords, status, request }
}
