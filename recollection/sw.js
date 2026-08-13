// App-shell caching only — no personal content ever passes through here.
// All reads/writes of prayers, saints, quotes, and reflections go straight
// to the Drive API over the network; this just makes the empty app open
// instantly (and its icon show up) even on a slow connection, and still
// work if a page load happens to be offline.
//
// Network-first, falling back to cache: always tries the network so edits
// to any shell file (app.js, saints-data.js, ...) show up on next reload
// with no version bump needed. The cache is purely an offline safety net,
// refreshed on every successful fetch.
const CACHE_NAME = "recollection-shell-v3";
const SHELL_FILES = [
  "./index.html",
  "./styles.css",
  "./auth.js",
  "./drive.js",
  "./app.js",
  "./config.js",
  "./store-local.js",
  "./saints-data.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never intercept calls to Google's APIs — those must always hit the network.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
