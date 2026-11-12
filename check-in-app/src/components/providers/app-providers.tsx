'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { installActionLogFlush } from '@/lib/audit/action-log'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { I18nProvider } from '@/lib/i18n/i18n-provider'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30000
          }
        }
      })
  )

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Upload queued action-log entries on start, reconnect and foreground.
  useEffect(() => installActionLogFlush(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          {children}
          <Toaster />
          {isMounted && process.env.NODE_ENV === 'development' ? (
            <ReactQueryDevtools initialIsOpen={false} />
          ) : null}
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}
