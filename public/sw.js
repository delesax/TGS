/*
 * The Grand Strategist service worker.
 *
 * Caches ONLY things that are the same for everyone and never personal:
 *   - the app shell: the offline page, the manifest and the icons (precached)
 *   - Next.js build files under /_next/static/ (fingerprinted, never change)
 * Pages (HTML), API responses, server actions and anything signed-in are never
 * cached: they always go to the network. When a page cannot load because the
 * device is offline, the offline page is shown instead.
 * No push notifications.
 */
const VERSION = "tgs-shell-v1";
const SHELL = ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { credentials: "omit", cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    // Always the network. Only if that fails (offline) show the offline page.
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
  // Everything else (API routes, data, images from elsewhere) is left to the browser.
});
