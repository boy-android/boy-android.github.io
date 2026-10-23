const CACHE_NAME = "boy-android-pwa-v1";
const OFFLINE_URL = "/offline.html";
const APP_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/pwa.js",
  "/boy-android-logo-transparent.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/account-expiry.js",
  "/account-expiry.css",
  "/device-lock.js",
  "/latest-posts.js",
  "/latest-posts.css",
  "/page-header.css"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("boy-android-pwa-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Halaman tetap diambil dari jaringan agar akun dan konten tidak disajikan dari cache lama.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }));
    return;
  }

  // Cache hanya aset lokal; permintaan Supabase dan halaman HTML tidak disimpan.
  if (/\.(?:css|js|png|svg|webmanifest|ico)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const update = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      return cached || update;
    })());
  }
});
