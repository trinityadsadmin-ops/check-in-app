'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const FONT_SCALE_KEY = 'trinity.fontScale'
const DEFAULT_FONT_SCALE = 1

/** Which verification sheet is open, if any. */
export type SheetMode = 'in' | 'out' | null

/** State of an in-flight emergency broadcast. */
export type AlertState = 'none' | 'active' | 'queued'

type ToggleSurface = {
  open: boolean
  toggle: () => void
  close: () => void
}

export type ShellContextValue = {
  /** Check-in / check-out verification sheet ('in' | 'out' | null). */
  sheet: SheetMode
  /** True when the open sheet is a manual (reason-flagged, unenforced-location) entry. */
  manual: boolean
  openCheckIn: (opts?: { manual?: boolean }) => void
  openCheckOut: (opts?: { manual?: boolean }) => void
  closeSheet: () => void

  /** SOS panel (hold-to-trigger emergency). */
  sos: ToggleSurface

  /** Center speed-dial FAB (Capture / Payslip / Settings). */
  fab: ToggleSurface

  /** Real device connectivity (`navigator.onLine`) — drives the net badge and
   *  whether an emergency is sent immediately or queued. */
  online: boolean

  /** Text-size setting; applied as `zoom` on the scroll area. Persisted. */
  fontScale: number
  setFontScale: (value: number) => void

  /** Active emergency broadcast state. */
  activeAlert: AlertState
  /** Backend emergency_logs id of the own in-flight alert ('active' only). */
  activeAlertId: string | null
  setActiveAlert: (state: AlertState, emergencyLogId?: string | null) => void
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<SheetMode>(null)
  const [manual, setManual] = useState(false)
  const [sosOpen, setSosOpen] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [online, setOnlineState] = useState(true)
  const [fontScale, setFontScaleState] = useState(DEFAULT_FONT_SCALE)
  const [activeAlert, setActiveAlertState] = useState<AlertState>('none')
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null)

  // Hydrate persisted font scale after mount.
  useEffect(() => {
    try {
      const stored = parseFloat(window.localStorage.getItem(FONT_SCALE_KEY) ?? '')
      if (stored && Number.isFinite(stored)) {
        setFontScaleState(stored)
      }
    } catch {
      // ignore
    }
  }, [])

  // Track real device connectivity.
  useEffect(() => {
    setOnlineState(navigator.onLine)
    const update = () => setOnlineState(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const openCheckIn = useCallback((opts?: { manual?: boolean }) => {
    setSheet('in')
    setManual(!!opts?.manual)
  }, [])
  const openCheckOut = useCallback((opts?: { manual?: boolean }) => {
    setSheet('out')
    setManual(!!opts?.manual)
  }, [])
  const closeSheet = useCallback(() => {
    setSheet(null)
    setManual(false)
  }, [])

  const sos = useMemo<ToggleSurface>(
    () => ({
      open: sosOpen,
      toggle: () => setSosOpen((prev) => !prev),
      close: () => setSosOpen(false)
    }),
    [sosOpen]
  )

  const fab = useMemo<ToggleSurface>(
    () => ({
      open: fabOpen,
      toggle: () => setFabOpen((prev) => !prev),
      close: () => setFabOpen(false)
    }),
    [fabOpen]
  )

  const setActiveAlert = useCallback(
    (state: AlertState, emergencyLogId: string | null = null) => {
      setActiveAlertState(state)
      setActiveAlertId(state === 'none' ? null : emergencyLogId)
    },
    []
  )

  const setFontScale = useCallback((value: number) => {
    setFontScaleState(value)
    try {
      window.localStorage.setItem(FONT_SCALE_KEY, String(value))
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo<ShellContextValue>(
    () => ({
      sheet,
      manual,
      openCheckIn,
      openCheckOut,
      closeSheet,
      sos,
      fab,
      online,
      fontScale,
      setFontScale,
      activeAlert,
      activeAlertId,
      setActiveAlert
    }),
    [
      sheet,
      manual,
      openCheckIn,
      openCheckOut,
      closeSheet,
      sos,
      fab,
      online,
      fontScale,
      setFontScale,
      activeAlert,
      activeAlertId,
      setActiveAlert
    ]
  )

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) {
    throw new Error('useShell must be used within a ShellProvider')
  }
  return ctx
}
