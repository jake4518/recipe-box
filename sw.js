// Our Recipe Box offline support.
// Bump VERSION whenever the app files change so phones pick up the new version.
const VERSION = "v3";
const SHELL_CACHE = "rb-shell-" + VERSION;
const PHOTO_CACHE = "rb-photos";
const FONT_CACHE = "rb-fonts";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rb-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // Photo file names never change, so once a photo is on the phone it never downloads again.
    if (url.pathname.includes("/photos/")) { e.respondWith(cacheFirst(req, PHOTO_CACHE)); return; }
    // App files: open instantly from the phone, update in the background.
    e.respondWith(staleWhileRevalidate(req, SHELL_CACHE, req.mode === "navigate" ? "index.html" : null));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(cacheFirst(req, FONT_CACHE));
  }
  // Everything else (the Apps Script backend) goes straight to the network.
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, name, fallbackKey) {
  const cache = await caches.open(name);
  const hit = (await cache.match(req, { ignoreSearch: true })) || (fallbackKey ? await cache.match(fallbackKey) : null);
  const net = fetch(req)
    .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return hit || (await net) || new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
}
