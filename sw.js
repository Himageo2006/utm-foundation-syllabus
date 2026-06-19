/* UTM Foundation Hub — service worker (offline shell) */
const CACHE = "utm-hub-v71";
const ASSETS = [
  "index.html", "subject.html",
  "lessons-calculus.html", "lessons-physics.html", "lessons-chemistry.html", "lessons-computing.html",
  "lessons-english.html", "lessons-statistics.html",
  "assets/data.js", "assets/papers.js", "assets/tutor.js", "assets/tutor.css", "assets/lessons.css", "assets/icon.svg",
  "manifest.json"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // never cache API calls
  if (url.hostname.includes("anthropic.com")) return;
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200 && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
