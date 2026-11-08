import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { Montserrat } from 'next/font/google'
import NavigationBarWrapper from './components/NavigationBar/wrapper'
import './globals.css'
import Register from './work/Register'

const montserrat = Montserrat({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-montserrat'
})

export const metadata: Metadata = {
  title: 'СП Организатор',
  description: 'Система планирования для ресторана',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' }
    ],
    apple: '/apple-touch-icon.png'
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#101215',
  viewportFit: 'cover',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang='ru' className={montserrat.variable}>
      <body className='relative min-h-full flex flex-col font-sans antialiased bg-background text-foreground'>
        <Register />
        <div className='relative z-10 flex flex-col flex-1'>
          <Suspense fallback={<div className='h-16' />}>
            <NavigationBarWrapper />
          </Suspense>
          <main className='app-main'>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
