'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function Register() {
  const pathname = usePathname()
  useEffect(() => {
    if ('serviceWorker' in navigator) void (async () => {
      await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const cache = await caches.open('sp-shell-v1')
      const response = await fetch('/work', { headers: { Accept: 'text/html' } })
      if (response.ok) await cache.put('/work', response)
      const assets = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => new URL(name).origin === location.origin && new URL(name).pathname.startsWith('/_next/static/'))
      await Promise.allSettled(assets.map(asset => cache.add(asset)))
    })().catch(() => {})
  }, [pathname])
  return null
}
