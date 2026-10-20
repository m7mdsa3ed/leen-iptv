// App shell. A build precaches its hashed /assets (list written by vite.config.ts `precacheList`); a new worker then WAITS
// until the page says "skip" (the Reload in the update toast, src/lib/pwa.ts), so a running page never has its files swapped.
// Navigations are network-first, /assets cache-first. Everything else (streams, APIs, cross-origin) passes through.
const B = { v: "dev", assets: [] }
const C = "leen-" + B.v
const post = (m) => self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage(m)))
self.addEventListener("install", (e) => e.waitUntil(caches.open(C).then((c) => {
  let done = 0
  const total = B.assets.length
  post({ type: "sw-progress", done, total })
  // an unchanged file is still in the old cache (same hash), so only changed ones are downloaded
  return Promise.all(B.assets.map((a) => caches.match(a)
    .then((m) => m || fetch(a).then((r) => { if (!r.ok) throw new Error(a + " " + r.status); return r }))
    .then((r) => c.put(a, r))
    .then(() => post({ type: "sw-progress", done: ++done, total }))))
})))
self.addEventListener("message", (e) => { if (e.data === "skip") self.skipWaiting() })
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url)
  if (r.method !== "GET" || u.origin !== location.origin) return
  const put = (res) => { if (res.ok) { const c = res.clone(); caches.open(C).then((x) => x.put(r, c)) } return res }
  if (r.mode === "navigate") e.respondWith(fetch(r).then(put).catch(() => caches.match(r).then((m) => m || caches.match("./"))))
  else if (u.pathname.includes("/assets/")) e.respondWith(caches.match(r).then((m) => m || fetch(r).then(put)))
})
