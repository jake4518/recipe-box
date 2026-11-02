// Bump VERSION whenever the freezer app files change so phones pick up the new version.
const VERSION = "v1";
const SHELL_CACHE = "fz-shell-" + VERSION;
const FONT_CACHE = "fz-fonts";
const SHELL = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL_CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("fz-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (!url.pathname.includes("/freezer/")) return;
    e.respondWith(staleWhileRevalidate(req, req.mode === "navigate" ? "./" : null));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(cacheFirst(req, FONT_CACHE));
  }
  // The Apps Script backend always goes straight to the network.
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, fallbackKey) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = (await cache.match(req, { ignoreSearch: true })) || (fallbackKey ? await cache.match(fallbackKey) : null);
  const net = fetch(req, { cache: "no-cache" })
    .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return hit || (await net) || new Response("You're offline. Open the app again once you're connected.", { status: 503, headers: { "Content-Type": "text/plain" } });
}
