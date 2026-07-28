import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { DeviceFrame } from "@/components/shell/device-frame";
import { RegisterSW } from "@/components/pwa/register-sw";

const inter = Inter({
  variable: "--font-sans-trinity",
  subsets: ["latin"],
  display: "swap",
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-thai-trinity",
  subsets: ["thai", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trinity AD — Staff",
  description: "Trinity AD staff app — attendance, capture, payslips and emergency SOS.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Trinity AD — Staff",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#00754A",
  width: "device-width",
  initialScale: 1,
  // Lock zoom so the app behaves like a native screen: no pinch-zoom, no
  // double-tap zoom. Content fits the viewport and scrolls vertically only.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${inter.variable} ${notoSansThai.variable} h-full antialiased`}
    >
      <body
        className="min-h-full"
        style={{
          fontFamily:
            "var(--font-sans-trinity), var(--font-thai-trinity), system-ui, sans-serif",
          background: "var(--trinity-bg)",
        }}
      >
        <AppProviders>
          <DeviceFrame>{children}</DeviceFrame>
        </AppProviders>
        <RegisterSW />
      </body>
    </html>
  );
}
