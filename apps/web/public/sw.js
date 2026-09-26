// Dinkuan service worker: keep the ticket wallet usable with no connection (PRD F6-AC4).
// Network first for the wallet pages (fresh data when online), cache fallback when offline.
// Only the wallet and static files are cached: other pages (admin, attendee lists, chats) can
// hold personal data and must not stay on a shared phone. Logout clears this cache too.
// Bumping the version deletes older caches that held every visited page.
const CACHE = "dinkuan-v2";
const OFFLINE_PAGES = ["/tickets"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE_PAGES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/posters/");
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }
  if (req.mode === "navigate") {
    const wallet = url.pathname === "/tickets" || url.pathname.startsWith("/tickets/");
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (wallet && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(wallet ? req : "/tickets").then((hit) => hit || caches.match("/tickets"))),
    );
  }
});
