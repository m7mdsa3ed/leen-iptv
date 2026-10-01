// CORS proxy handler: /p?url=<encoded> (any method; body and x-plex-*/accept/content-type/authorization/range headers are forwarded). Shared by `pnpm proxy` and the Vite dev/preview server.
// Follows redirects (providers 302 streams to other hosts that send no CORS headers) and rewrites HLS playlists
// so every segment/key goes back through /p too. Returns true when it handled the request.
import { Readable } from "node:stream"
import { lookup } from "node:dns/promises"

// SSRF guard: block loopback / unspecified / link-local (metadata) targets; RFC1918 stays allowed for LAN servers.
// ponytail: resolve-then-fetch, so DNS rebinding can still race it; pin the resolved IP if that matters.
const bad = (a) => {
  a = a.toLowerCase().replace(/^::ffff:/, "")
  return /^(127\.|0\.|169\.254\.)/.test(a) || a === "::1" || a === "::" || /^fe[89ab]/.test(a)
}
async function guard(href) {
  const h = new URL(href).hostname.replace(/^\[|\]$/g, "")
  const addrs = /^[\d.]+$|:/.test(h) ? [{ address: h }] : await lookup(h, { all: true })
  if (addrs.some((x) => bad(x.address))) throw new Error("blocked target")
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "*" }

export function proxyHandler(req, res) {
  const u = new URL(req.url, "http://x")
  if (u.pathname !== "/p") return false
  if (req.method === "OPTIONS") return res.writeHead(204, CORS).end(), true
  const target = u.searchParams.get("url")
  if (!/^https?:\/\//.test(target ?? "")) return res.writeHead(400, CORS).end("bad url"), true
  const ctl = new AbortController()
  res.on("close", () => ctl.abort()) // viewer left: stop pulling the upstream stream
  ;(async () => {
    try {
      const headers = {}
      for (const [k, v] of Object.entries(req.headers)) if (/^(x-plex-.*|x-emby-authorization|accept|content-type|range)$/.test(k)) headers[k] = v
      const init = { method: req.method, headers, redirect: "manual", signal: ctl.signal }
      if (req.method !== "GET" && req.method !== "HEAD") {
        const chunks = []
        for await (const c of req) chunks.push(c)
        init.body = Buffer.concat(chunks)
      }
      let cur = target, up
      for (let n = 0; ; n++) {
        await guard(cur)
        up = await fetch(cur, init)
        const loc = up.status >= 300 && up.status < 400 && up.headers.get("location")
        if (!loc) break
        if (n >= 8) throw new Error("too many redirects")
        cur = new URL(loc, cur).href
        if (!/^https?:/.test(cur)) throw new Error("bad redirect")
        if (up.status === 303 || ((up.status === 301 || up.status === 302) && req.method === "POST")) { init.method = "GET"; delete init.body }
      }
      const type = up.headers.get("content-type") || ""
      const out = { ...CORS, "content-type": type }
      for (const h of ["content-range", "accept-ranges", "content-length"]) if (up.headers.get(h) && !(h === "content-length" && up.headers.get("content-encoding"))) out[h] = up.headers.get(h) // fetch already decoded the body
      if (/mpegurl/i.test(type) || /\.m3u8(\?|$)/.test(cur)) {
        const wrap = (l) => "/p?url=" + encodeURIComponent(new URL(l, cur).href)
        const body = (await up.text())
          .split("\n")
          .map((l) => (l.startsWith("#") ? l.replace(/URI="([^"]+)"/g, (_, x) => `URI="${wrap(x)}"`) : l.trim() ? wrap(l.trim()) : l))
          .join("\n")
        delete out["content-length"]
        return res.writeHead(up.status, out).end(body)
      }
      res.writeHead(up.status, out)
      if (!up.body) return res.end()
      Readable.fromWeb(up.body).on("error", () => res.destroy()).pipe(res)
    } catch (e) {
      if (!res.headersSent) res.writeHead(/blocked/.test(String(e)) ? 403 : 502, CORS).end(String(e))
      else res.destroy()
    }
  })()
  return true
}
