const CACHE_PREFIX = 'cores-dashboard-'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name))),
      ),
      self.clients.claim(),
    ]),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// Keep a fetch listener for PWA detection, but let the browser use the network
// directly. The dashboard depends on live APIs, so stale runtime caches provide
// no useful offline mode and can retain obsolete application code.
self.addEventListener('fetch', () => {})
