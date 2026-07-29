'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  getGetCurrentUserQueryKey,
  signIn as apiSignIn,
  signOut as apiSignOut,
  useGetCurrentUser
} from '@/generated/api/auth/auth'
import { SignInRequestClientType, type SignInRequest, type User } from '@/generated/api/model'
import { ApiError } from '@/lib/api/fetch-client'
import { clearStoredSession, getStoredSession, setStoredSession } from '@/lib/api/session'
import { getDeviceUuid, setDeviceUuid } from '@/lib/auth/device'

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (input: SignInRequest) => Promise<void>
  signOut: () => Promise<void>
  /**
   * `true` when the last sign-in was rejected because the account is bound to a
   * different device (backend 403). The login screen renders the blocked card.
   */
  blocked: boolean
  /** Clears the blocked flag (e.g. after the admin resets the binding). */
  clearBlocked: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Returns true when an error represents the device-bound 403 rejection.
 * The login screen uses this to distinguish "blocked" from ordinary failures.
 */
export function isDeviceBlockedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [hasSession, setHasSession] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [blocked, setBlocked] = useState(false)

  // localStorage is only available on the client, so resolve the session after mount.
  useEffect(() => {
    setHasSession(getStoredSession() !== null)
    setIsHydrated(true)
  }, [])

  const meQuery = useGetCurrentUser({
    query: {
      enabled: hasSession,
      retry: false,
      staleTime: 60000
    }
  })

  // A stored token that the backend rejects (expired/invalid) — drop it.
  useEffect(() => {
    if (meQuery.isError) {
      clearStoredSession()
      setHasSession(false)
    }
  }, [meQuery.isError])

  const clearBlocked = useCallback(() => {
    setBlocked(false)
  }, [])

  const signIn = useCallback(
    async (input: SignInRequest) => {
      // Mobile clients bind to a device: send clientType + a stable deviceUuid so
      // the backend can enforce single-device access. Callers may still override.
      const payload: SignInRequest = {
        clientType: SignInRequestClientType.MOBILE,
        deviceUuid: getDeviceUuid() ?? undefined,
        ...input
      }

      let response
      try {
        response = await apiSignIn(payload)
      } catch (error) {
        // A device-bound rejection (403) surfaces as the blocked state; the login
        // screen reads `blocked` and/or inspects the rethrown ApiError.
        if (isDeviceBlockedError(error)) {
          setBlocked(true)
        }
        throw error
      }

      if (!response.session) {
        throw new Error('Sign-in did not return a session')
      }
      // Adopt the server-authoritative device uuid so the persisted value always
      // matches the bound one (covers server-generated fallbacks and legacy binds).
      if (response.device?.deviceUuid) {
        setDeviceUuid(response.device.deviceUuid)
      }
      // Abort any /me request still in flight from a previous (possibly stale/invalid)
      // token before writing the new one. Without this, invalidateQueries() below can
      // no-op and reuse that stale request's promise — when it later resolves 401, the
      // isError effect wipes the session we're about to set.
      await queryClient.cancelQueries({ queryKey: getGetCurrentUserQueryKey() })
      setStoredSession({
        accessToken: response.session.accessToken,
        refreshToken: response.session.refreshToken
      })
      setBlocked(false)
      setHasSession(true)
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() })
    },
    [queryClient]
  )

  const signOut = useCallback(async () => {
    try {
      await apiSignOut()
    } catch {
      // Ignore server/network errors on sign-out; we always clear locally.
    }
    clearStoredSession()
    setHasSession(false)
    queryClient.clear()
    router.replace('/login')
  }, [queryClient, router])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data?.user ?? null,
      isAuthenticated: hasSession && Boolean(meQuery.data?.user),
      isLoading: !isHydrated || (hasSession && meQuery.isLoading),
      signIn,
      signOut,
      blocked,
      clearBlocked
    }),
    [hasSession, isHydrated, meQuery.data, meQuery.isLoading, signIn, signOut, blocked, clearBlocked]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
