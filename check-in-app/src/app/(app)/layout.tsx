import { AppShell } from '@/components/shell/app-shell'
import { AuthGuard } from '@/components/auth/auth-guard'
import { ActiveAlert } from '@/components/shell/active-alert'
import { CheckInSheet } from '@/components/shell/check-in-sheet'
import { IncomingAlert } from '@/components/shell/incoming-alert'
import { SiteListSheet } from '@/components/shell/site-list-sheet'
import { SosPanel } from '@/components/shell/sos-panel'
import { ShellProvider } from '@/lib/shell/shell-provider'

/**
 * Layout for the authenticated `(app)` route group. Guards access, provides the
 * shared overlay/transient shell state, and wraps every page in the app chrome.
 * Screen pages render as `{children}` inside the shell's scroll area.
 *
 * The self-gating overlays (check-in/out verification sheet, work-sites list,
 * SOS hold-to-trigger panel, and the active-emergency broadcast banner) are
 * mounted once here via the shell's `overlays` slot — each reads its own
 * visibility from `useShell()`.
 * The camera overlay is opener-driven and owned by the Capture page; the payslip
 * viewer is rendered directly by the Payslip page.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ShellProvider>
        <AppShell
          overlays={
            <>
              <CheckInSheet />
              <SiteListSheet />
              <SosPanel />
              <IncomingAlert />
              <ActiveAlert />
            </>
          }
        >
          {children}
        </AppShell>
      </ShellProvider>
    </AuthGuard>
  )
}
