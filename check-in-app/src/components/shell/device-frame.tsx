'use client'

/**
 * Device frame.
 *
 * On desktop viewports (>= 640px, Tailwind `sm:`) the app is rendered inside an
 * iPhone-style chrome (402×846, rounded corners, dynamic island), matching the
 * design prototype. On mobile viewports (< 640px) the frame collapses and the
 * app fills the screen edge-to-edge. The switch is purely CSS media-query based
 * (no UA sniffing) so it stays SSR-safe and respects browser dev-tools resizing.
 */
export function DeviceFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="device-frame-root">
      <div className="device-frame-bezel">
        <div className="device-frame-screen">
          {/* dynamic island — desktop frame only */}
          <div className="device-frame-island" aria-hidden />
          {/* id used as a portal target for full-screen overlays (e.g. camera)
              so they cover the whole screen but stay inside the device frame. */}
          <div id="trinity-frame-content" className="device-frame-content">
            {/* The app fills the frame and scrolls vertically only (native-app
                feel — no pinch-zoom or pan). Full-screen overlays (camera,
                sheets) portal into #trinity-frame-content so they cover the
                whole screen. */}
            {children}
          </div>
        </div>
      </div>

      <style>{`
        /* Mobile-first: full-bleed, no frame. Explicit viewport height so the
           app shell's flex column fills the screen and its bottom nav stays
           pinned (a % / min-height chain would collapse and float the nav). */
        .device-frame-root {
          width: 100%;
          height: 100svh;
          background: var(--trinity-bg);
        }
        .device-frame-bezel {
          width: 100%;
          height: 100%;
          background: transparent;
        }
        .device-frame-screen {
          position: relative;
          width: 100%;
          height: 100%;
          background: var(--trinity-bg);
          overflow: hidden;
        }
        .device-frame-island {
          display: none;
        }
        .device-frame-content {
          position: relative;
          width: 100%;
          height: 100%;
        }

        /* Desktop: iPhone-style frame, centred. */
        @media (min-width: 640px) {
          .device-frame-root {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 28px 16px;
            background: #e3e3e4;
          }
          .device-frame-bezel {
            position: relative;
            width: 402px;
            height: 846px;
            min-height: 0;
            flex: none;
            background: #0a0d14;
            border-radius: 56px;
            padding: 11px;
            box-shadow:
              0 30px 60px -20px rgba(15, 23, 42, 0.55),
              0 0 0 2px #1f2733,
              inset 0 0 0 2px #000;
          }
          .device-frame-screen {
            position: absolute;
            inset: 11px;
            width: auto;
            min-height: 0;
            border-radius: 46px;
            background: var(--trinity-bg);
          }
          .device-frame-island {
            display: block;
            position: absolute;
            top: 11px;
            left: 50%;
            transform: translateX(-50%);
            width: 118px;
            height: 32px;
            background: #000;
            border-radius: 20px;
            z-index: 61;
            pointer-events: none;
          }
          .device-frame-content {
            position: absolute;
            inset: 0;
            width: auto;
            min-height: 0;
          }
        }
      `}</style>
    </div>
  )
}
