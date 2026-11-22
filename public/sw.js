/* Calvary Finder - minimal service worker.
 *
 * Why it exists: Chrome on Android only offers its real "Install" prompt to
 * sites that have a web app manifest AND a service worker that handles
 * fetches. This one does the bare minimum: it hands every page request
 * straight back to the network, exactly as if it were not here.
 *
 * What it deliberately does NOT do: no caching, no offline copy, and it never
 * touches API calls, audio streams, images or scripts. That keeps the
 * "new version available" banner (which compares against the live server)
 * and the radio streams behaving exactly as they did before. If offline
 * support is ever wanted, it would be added here - on purpose, not by accident.
 */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (event) {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
  }
});
