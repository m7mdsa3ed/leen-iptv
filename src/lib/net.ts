// ponytail: optional CORS proxy (server/proxy.mjs); packaged webOS apps usually don't need it, hosted/web ones do.
// Proxy formats: "https://host/path?url={url}" (template, URL-encoded), "https://proxy.corsfix.com/?" (ends in ? or =, raw URL appended),
// or a bare base like "http://lan:8787" (our server/proxy.mjs, /p?url=).
// True when the server hosting this page also exposes /p (Vite dev/preview, `pnpm proxy`). Probed once at startup.
let local = false
export const probeProxy = async () => {
  if (!/^https?:$/.test(location.protocol)) return
  try {
    const r = await fetch("/p", { cache: "no-store" })
    local = r.status === 400 && (await r.text()).includes("bad url")
  } catch { /* no local proxy */ }
}

/** True when this https page can't load the (http) URL directly. */
export const mixed = (url: string) => location.protocol === "https:" && url.startsWith("http:")

export const px = (url: string, proxy: string) => {
  const p = proxy.trim()
  if (!p) return local ? `/p?url=${encodeURIComponent(url)}` : url
  if (p.includes("{url}")) return p.replace("{url}", encodeURIComponent(url))
  if (/[?=]$/.test(p)) return p + url
  return `${p.replace(/\/+$/, "")}/p?url=${encodeURIComponent(url)}`
}

export class HttpError extends Error {
  status: number
  constructor(status: number) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

export const statusMsg = (s: number) =>
  s === 404 ? "Not available on your provider (404). The title or channel may have been removed."
  : s === 401 || s === 403 ? `Access denied (${s}). Check your subscription, expiry date and number of simultaneous connections.`
  : s === 429 ? "Too many requests (429). Wait a moment and retry."
  : s >= 500 ? `The provider's server had an error (${s}). Try again later.`
  : `Request failed (${s}).`

export const CORS_HINT = "Couldn't reach the server. Check the address and your connection. If the browser is blocking it (CORS), set a proxy in Settings > Network."

/** Turn any thrown value into a sentence a viewer can act on. */
export function explain(e: unknown): string {
  if (e instanceof HttpError) return statusMsg(e.status)
  if (e instanceof DOMException && e.name === "AbortError") return "The server took too long to answer. Try again."
  if (e instanceof TypeError) return CORS_HINT
  return e instanceof Error ? e.message : String(e)
}

// AbortSignal.timeout is Chrome 103; webOS 23 is Chromium 94.
export async function fetchT(url: string, ms = 60000, init?: RequestInit): Promise<Response> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { ...init, signal: c.signal })
    if (!r.ok) throw new HttpError(r.status)
    return r
  } finally {
    clearTimeout(t)
  }
}

/** Text of a URL, transparently gunzipping .xml.gz style payloads. */
export async function fetchText(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetchT(url, 120000)).arrayBuffer())
  if (buf[0] === 0x1f && buf[1] === 0x8b && "DecompressionStream" in window) {
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))
    return await new Response(s).text()
  }
  return new TextDecoder().decode(buf)
}

/** Stream URLs: an explicit proxy only when "Proxy streams too" is on; the built-in same-origin proxy is automatic. */
export const pxStream = (url: string, s: { proxy: string; proxyStreams: boolean }) =>
  s.proxy.trim() && !s.proxyStreams ? url : px(url, s.proxy)

/** Plex-style fetch: direct first (CORS-simple GETs), through the proxy when mixed content or a network/CORS TypeError. */
export async function plexFetch(url: string, proxy: string, init?: RequestInit, ms = 30000): Promise<Response> {
  if (mixed(url)) return fetchT(px(url, proxy), ms, init)
  try {
    return await fetchT(url, ms, init)
  } catch (e) {
    const p = px(url, proxy)
    if (!(e instanceof TypeError) || p === url) throw e
    return fetchT(p, ms, init)
  }
}
