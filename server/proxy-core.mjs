// CORS proxy handler: GET /p?url=<encoded>. Shared by `pnpm proxy` and the Vite dev/preview server.
// Follows redirects (providers 302 streams to other hosts that send no CORS headers) and rewrites HLS playlists
// so every segment/key goes back through /p too. Returns true when it handled the request.
import { Readable } from "node:stream"

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
      if (req.headers.range) headers.range = req.headers.range
      const up = await fetch(target, { headers, redirect: "follow", signal: ctl.signal })
      const type = up.headers.get("content-type") || ""
      const out = { ...CORS, "content-type": type }
      for (const h of ["content-range", "accept-ranges", "content-length"]) if (up.headers.get(h)) out[h] = up.headers.get(h)
      if (/mpegurl/i.test(type) || /\.m3u8(\?|$)/.test(up.url)) {
        const wrap = (l) => "/p?url=" + encodeURIComponent(new URL(l, up.url).href)
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
      if (!res.headersSent) res.writeHead(502, CORS).end(String(e))
      else res.destroy()
    }
  })()
  return true
}
