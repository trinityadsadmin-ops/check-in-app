'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker that caches the app shell and serves an offline
 * fallback. Renders nothing; mounted once in the root layout. Registration is
 * skipped in development to avoid stale-cache surprises during HMR.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      return
    }
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    // Only reload-on-update if a service worker was already controlling this
    // page — a first-ever install also fires `controllerchange`, and reloading
    // then would just be a pointless flicker for a brand-new visitor.
    const hadController = Boolean(navigator.serviceWorker.controller)
    let hasReloaded = false

    const handleControllerChange = () => {
      if (!hadController || hasReloaded) {
        return
      }
      hasReloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // Force an immediate update check rather than waiting for the browser's
          // own lazy schedule — iOS home-screen PWAs are especially slow to notice.
          registration.update().catch(() => undefined)
        })
        .catch(() => {
          // Registration failures are non-fatal — the app still works online.
        })
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      window.removeEventListener('load', register)
    }
  }, [])

  return null
}
