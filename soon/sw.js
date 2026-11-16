// Replaces the retired web app's service worker at app/sw.js: clears its caches, unregisters itself and reloads open
// tabs, so earlier visitors see the coming-soon page instead of a cached copy of the old app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })(),
  );
});
