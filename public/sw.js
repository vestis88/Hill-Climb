// Offline support. Pages are fetched from the network first so new versions arrive as soon
// as they are published, falling back to the cache when offline. Built files have unique
// names per version, so they are served from the cache first.
const CACHE = 'ridgeline-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./'])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  // The version check must always ask the server (src/main.ts checkForUpdate).
  if (new URL(request.url).pathname.endsWith('/version.json')) return
  const store = (response) => {
    if (response.ok) {
      const copy = response.clone()
      caches.open(CACHE).then((cache) => cache.put(request, copy))
    }
    return response
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(store).catch(() => caches.match(request).then((hit) => hit || caches.match('./'))))
    return
  }
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then(store)))
})
