const CACHE = 'sp-shell-v2'
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/icon-192.png', '/icon-512.png'])))
  self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('sp-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const saved = await cache.match(event.request)
      if (saved) return saved
      const response = await fetch(event.request)
      if (response.ok) await cache.put(event.request, response.clone())
      return response
    }))
  } else if (event.request.mode === 'navigate' && !url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch(event.request)
        if (url.pathname === '/work' && response.ok) await cache.put('/work', response.clone())
        return response
      } catch {
        return await cache.match('/work') || await cache.match('/offline.html')
      }
    })())
  }
})
self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('СП Организатор', { body: 'Есть новые события в работе команды', icon: '/icon-192.png', tag: 'sp-work', data: '/work' }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients.find(client => new URL(client.url).origin === self.location.origin)
    if (client) { await client.navigate('/work'); return client.focus() }
    return self.clients.openWindow('/work')
  }))
})
