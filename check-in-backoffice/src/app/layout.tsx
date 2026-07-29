import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import 'leaflet/dist/leaflet.css'
import './globals.css'
import { AppProviders } from '@/components/providers/app-providers'

const fontSans = Inter({ subsets: ['latin'], variable: '--font-app-sans' })

export const metadata: Metadata = {
  title: 'Check-in Backoffice',
  description: 'Backoffice console for the check-in platform.'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${fontSans.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
