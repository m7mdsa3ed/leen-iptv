// App-shell cache. Network-first for navigations, stale-while-revalidate for /assets. Everything else (streams, APIs, cross-origin) passes through.
const C = "iptv-v1"
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url)
  if (r.method !== "GET" || u.origin !== location.origin) return
  const put = (res) => { if (res.ok) { const c = res.clone(); caches.open(C).then((x) => x.put(r, c)) } return res }
  if (r.mode === "navigate") e.respondWith(fetch(r).then(put).catch(() => caches.match(r).then((m) => m || caches.match("./"))))
  else if (u.pathname.includes("/assets/")) e.respondWith(caches.match(r).then((m) => { const n = fetch(r).then(put).catch(() => m); return m || n }))
})
