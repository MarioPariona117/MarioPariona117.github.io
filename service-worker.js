// Retires Recollection's old service worker on mariopariona117.github.io.
// Browsers that installed the app here keep serving it from cache and never
// reach the redirect page; this replacement clears those caches, unregisters
// itself and reloads open tabs so they land on mariopariona.com.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: 'window' });
    tabs.forEach((tab) => tab.navigate(tab.url));
  })());
});
