'use client'

import { Clock, Info, MapPin, RotateCcw, Scan, Send, SwitchCamera, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGeolocation } from '@/lib/geo/use-geolocation'
import { useI18n } from '@/lib/i18n/i18n-provider'

/** A photo produced by the camera overlay, handed back to the opener. */
export type CapturedPhoto = {
  /** Raw image bytes (JPEG/PNG/WebP). */
  blob: Blob
  /** A local object URL for immediate preview; caller owns revocation. */
  previewUrl: string
  /** Capture moment (client clock). */
  capturedAt: Date
  /** Latitude at capture time, if a fix was available. */
  lat: number | null
  /** Longitude at capture time, if a fix was available. */
  lng: number | null
  /** Optional free-text note entered after capture. */
  notes: string
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function formatGps(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return '—'
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

/**
 * Full-screen camera overlay (per the prototype `<!-- ===== CAMERA ===== -->`).
 *
 * Tries a live `getUserMedia` preview; if the device/permission denies it, it
 * falls back to a native file/camera `<input capture>`. On shutter it freezes a
 * frame (or uses the picked file), stamps it with a GPS coordinate + timestamp,
 * lets the user add a note, and hands the resulting {@link CapturedPhoto} back to
 * the opener via `onCapture`. The opener decides how to persist it (e.g. through
 * the attendance upload-url mechanism).
 */
export function CameraCapture({
  open,
  onClose,
  onCapture
}: {
  open: boolean
  onClose: () => void
  onCapture: (photo: CapturedPhoto) => void | Promise<void>
}) {
  const { t } = useI18n()
  const { coords, request } = useGeolocation()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const notesInputId = useId()

  const [streamReady, setStreamReady] = useState(false)
  const [facing, setFacing] = useState<'user' | 'environment'>('environment')
  const [captured, setCaptured] = useState<CapturedPhoto | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Portal target: the device-frame interior, so the overlay covers the whole
  // screen (header + bottom nav) yet stays clipped inside the frame on desktop.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setPortalTarget(document.getElementById('trinity-frame-content') ?? document.body)
  }, [])

  const stopStream = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      streamRef.current = null
    }
    setStreamReady(false)
  }, [])

  // Acquire a GPS fix whenever the overlay opens.
  useEffect(() => {
    if (!open) return
    request()
  }, [open, request])

  // Acquire the camera stream whenever the overlay opens or the facing mode is
  // toggled; tear down on close/toggle so the previous device is released.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    const start = async () => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false
        })
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setStreamReady(true)
      } catch {
        // No camera / permission denied → file-input fallback path.
        setStreamReady(false)
      }
    }

    void start()

    return () => {
      cancelled = true
      stopStream()
    }
  }, [open, facing, stopStream])

  // Reset transient state each time the overlay opens.
  useEffect(() => {
    if (open) {
      setCaptured(null)
      setNotes('')
      setSubmitting(false)
    }
  }, [open])

  // Revoke the preview URL when it is replaced or the overlay unmounts.
  useEffect(() => {
    return () => {
      if (captured) URL.revokeObjectURL(captured.previewUrl)
    }
  }, [captured])

  const acceptBlob = useCallback(
    (blob: Blob) => {
      const previewUrl = URL.createObjectURL(blob)
      setCaptured({
        blob,
        previewUrl,
        capturedAt: new Date(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        notes: ''
      })
    },
    [coords]
  )

  const shutter = useCallback(() => {
    const video = videoRef.current
    if (streamReady && video && video.videoWidth > 0) {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (blob) => {
            if (blob) acceptBlob(blob)
          },
          'image/jpeg',
          0.9
        )
        return
      }
    }
    // No live stream → trigger the native camera/file picker.
    fileInputRef.current?.click()
  }, [streamReady, acceptBlob])

  const onFilePicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) acceptBlob(file)
    },
    [acceptBlob]
  )

  const toggleFacing = useCallback(() => {
    setFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }, [])

  const retake = useCallback(() => {
    if (captured) URL.revokeObjectURL(captured.previewUrl)
    setCaptured(null)
    setNotes('')
  }, [captured])

  const close = useCallback(() => {
    stopStream()
    onClose()
  }, [stopStream, onClose])

  const submit = useCallback(async () => {
    if (!captured || submitting) return
    setSubmitting(true)
    try {
      await onCapture({ ...captured, notes })
      stopStream()
    } finally {
      setSubmitting(false)
    }
  }, [captured, notes, submitting, onCapture, stopStream])

  if (!open || !portalTarget) return null

  const liveGps = captured
    ? formatGps(captured.lat, captured.lng)
    : formatGps(coords?.lat ?? null, coords?.lng ?? null)
  const stamp = captured
    ? `${pad(captured.capturedAt.getHours())}:${pad(captured.capturedAt.getMinutes())}:${pad(captured.capturedAt.getSeconds())}`
    : ''

  const overlay = (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 90,
        background: '#0a0d14',
        display: 'flex',
        flexDirection: 'column',
        animation: 'rm-fade .2s ease'
      }}
    >
      {/* header */}
      <div
        style={{
          padding: '56px 18px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: '#fff'
        }}
      >
        <button
          type="button"
          onClick={close}
          aria-label={t.cancel}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: 0,
            display: 'flex'
          }}
        >
          <X size={24} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{t.capture_title}</div>
      </div>

      {/* viewfinder */}
      <div
        style={{
          flex: 1,
          margin: '0 14px',
          borderRadius: 10,
          overflow: 'hidden',
          position: 'relative',
          background: '#171A20'
        }}
      >
        {captured ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- live blob preview, not a remote asset */}
            <img
              src={captured.previewUrl}
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(0,0,0,.5)',
                  color: '#fff',
                  padding: '4px 9px',
                  borderRadius: 7,
                  fontSize: 11,
                  fontWeight: 600,
                  alignSelf: 'flex-start'
                }}
              >
                <MapPin size={12} />
                {liveGps}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(0,0,0,.5)',
                  color: '#fff',
                  padding: '4px 9px',
                  borderRadius: 7,
                  fontSize: 11,
                  fontWeight: 600,
                  alignSelf: 'flex-start',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                <Clock size={12} />
                {stamp}
              </span>
            </div>
          </>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: streamReady ? 1 : 0
              }}
            />
            {!streamReady && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,.5)',
                  gap: 10
                }}
              >
                <Scan size={46} />
                <div style={{ fontSize: 13 }}>{t.viewfinder_hint}</div>
              </div>
            )}
            {/* framing corners */}
            <div style={cornerStyle('tl')} />
            <div style={cornerStyle('tr')} />
            <div style={cornerStyle('bl')} />
            <div style={cornerStyle('br')} />
          </>
        )}
      </div>

      {/* hidden native fallback input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture={facing}
        onChange={onFilePicked}
        style={{ display: 'none' }}
      />

      {captured ? (
        <div
          style={{
            background: '#fff',
            borderRadius: '20px 20px 0 0',
            marginTop: 14,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor={notesInputId}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--trinity-mfg)' }}
            >
              {t.notes_field}
            </label>
            <input
              id={notesInputId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.notes_ph}
              style={{
                height: 44,
                border: '1px solid var(--trinity-border)',
                borderRadius: 10,
                padding: '0 13px',
                fontSize: 14,
                fontFamily: 'inherit',
                outline: 0
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={retake}
              disabled={submitting}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 4,
                border: '1px solid var(--trinity-border)',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--trinity-fg)'
              }}
            >
              <RotateCcw size={17} />
              {t.retake}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              style={{
                flex: 1.4,
                height: 48,
                borderRadius: 4,
                background: 'var(--trinity-primary)',
                color: '#fff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: submitting ? 0.7 : 1
              }}
            >
              <Send size={17} />
              {t.submit}
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '20px 0 30px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <div style={{ width: 44, height: 44 }} />
            <button
              type="button"
              onClick={shutter}
              aria-label={t.capture_title}
              style={{
                width: 74,
                height: 74,
                borderRadius: '50%',
                background: '#fff',
                border: '4px solid rgba(255,255,255,.45)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0
              }}
            >
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  background: '#fff',
                  border: '1px solid #cbd5e1'
                }}
              />
            </button>
            <button
              type="button"
              onClick={toggleFacing}
              aria-label="Switch camera"
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'rgba(255,255,255,.15)',
                border: '1px solid rgba(255,255,255,.3)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0
              }}
            >
              <SwitchCamera size={20} />
            </button>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,.55)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Info size={13} />
            {t.fallback_hint}
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(overlay, portalTarget)
}

function cornerStyle(corner: 'tl' | 'tr' | 'bl' | 'br'): React.CSSProperties {
  const c = 'rgba(255,255,255,.6)'
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 26,
    height: 26
  }
  switch (corner) {
    case 'tl':
      return {
        ...base,
        top: 16,
        left: 16,
        borderLeft: `2px solid ${c}`,
        borderTop: `2px solid ${c}`,
        borderRadius: '4px 0 0 0'
      }
    case 'tr':
      return {
        ...base,
        top: 16,
        right: 16,
        borderRight: `2px solid ${c}`,
        borderTop: `2px solid ${c}`,
        borderRadius: '0 4px 0 0'
      }
    case 'bl':
      return {
        ...base,
        bottom: 16,
        left: 16,
        borderLeft: `2px solid ${c}`,
        borderBottom: `2px solid ${c}`,
        borderRadius: '0 0 0 4px'
      }
    case 'br':
      return {
        ...base,
        bottom: 16,
        right: 16,
        borderRight: `2px solid ${c}`,
        borderBottom: `2px solid ${c}`,
        borderRadius: '0 0 4px 0'
      }
  }
}
