// BindLens Web works without a network once it has been opened: this keeps the app itself in the browser.
// Your documents are not here: the ones you opened are kept by the app (IndexedDB), and what you change offline
// goes up to your Drive when the network is back.
const V = new URL(self.location).searchParams.get("v") || "1";
const CACHE = "bindlens-app-" + V;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/app/", "/app/manifest.webmanifest", "/app/logo.png"]).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("bindlens-app-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || !u.pathname.startsWith("/app/") || u.pathname === "/app/sw.js") return;
  // files whose names change with every version (assets, fonts): the copy kept, or the network once
  if (u.pathname.startsWith("/app/assets/") || u.pathname.startsWith("/app/fonts/")) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
    return;
  }
  // the page and the rest: the network first (always the latest BindLens), the kept copy without a network
  e.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    } catch (err) {
      const c = await caches.open(CACHE);
      return (await c.match(req, { ignoreSearch: true })) || (await c.match("/app/")) || Response.error();
    }
  })());
});

// a notification (What needs you): clicking it brings BindLens to the front
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = all.find(c => new URL(c.url).pathname.startsWith("/app"));
    if (w) { await w.focus(); w.postMessage({ bl: "needs", key: e.notification.data && e.notification.data.key }); return; }
    await self.clients.openWindow("/app/");
  })());
});
