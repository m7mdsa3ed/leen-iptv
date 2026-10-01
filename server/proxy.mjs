// Tiny CORS proxy + static host for dist/.  node server/proxy.mjs  (PORT=8787)
// /p?url=<encoded>  -> fetches upstream, adds CORS headers, rewrites HLS playlists so segments go through the proxy too (see proxy-core.mjs).
import http from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import { proxyHandler } from "./proxy-core.mjs"

const PORT = process.env.PORT || 8787
const DIST = new URL("../dist", import.meta.url).pathname
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" }

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x")
  if (proxyHandler(req, res)) return
  const f = normalize(join(DIST, u.pathname === "/" ? "index.html" : u.pathname))
  if (!f.startsWith(DIST)) return res.writeHead(403).end()
  readFile(f).then((b) => res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" }).end(b), () => res.writeHead(404).end())
}).listen(PORT, () => console.log(`proxy + app on :${PORT}`))
