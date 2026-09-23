const CACHE = 'credvault-holder-v1';
const SHELL = ['/holder.html', '/style.css', '/'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return;             // network for API
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
