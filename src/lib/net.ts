import { t } from "./i18n"
import { useApp } from "./store"
import { logError } from "./errlog"
import { describeError, errorFacts } from "./errlog-pure"
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

/** Artwork at `w` pixels through OUR proxy's resize route (server/image.mjs). Any other proxy, or none, gets the URL unchanged:
    a third-party proxy that ignores `w` would still serve the original, and an unresized image is always better than a broken one. */
export const imageUrl = (url: string, w: number) => {
  const p = useApp.getState().settings.proxy?.trim() || ""
  // a panel logo is usually plain http: on an https page the browser blocks it, so it MUST go through a proxy even though that loses the resize
  if (mixed(url)) return px(url, p)
  if (p) {
    if (p.includes("{url}")) return url // template proxies cannot carry a width
    if (/[?=]$/.test(p)) return url
    return `${p.replace(/\/+$/, "")}/p?w=${w}&url=${encodeURIComponent(url)}`
  }
  return local ? `/p?w=${w}&url=${encodeURIComponent(url)}` : url
}

export const px = (url: string, proxy: string) => {
  const p = proxy.trim()
  if (!p) return local ? `/p?url=${encodeURIComponent(url)}` : url
  if (p.includes("{url}")) return p.replace("{url}", encodeURIComponent(url))
  if (/[?=]$/.test(p)) return p + url
  return `${p.replace(/\/+$/, "")}/p?url=${encodeURIComponent(url)}`
}

/** A non-2xx answer. `url`, `method` and the start of the response `body` go to the error log's detail page (redacted). */
export class HttpError extends Error {
  status: number
  url?: string
  method?: string
  body?: string
  constructor(status: number, url?: string, method?: string, body?: string) {
    super(`HTTP ${status}`)
    this.name = "HttpError"
    this.status = status
    this.url = url
    this.method = method
    this.body = body
  }
}

/** "GET host/path" of a request for the error log: the target of a /p?url= proxy URL, no query string (ids and tokens live there). */
export function reqCtx(method: string, url: string): string {
  let u = url
  const m = /\/p\?url=([^&]+)/.exec(url)
  if (m) try { u = decodeURIComponent(m[1]) } catch { /* keep the proxy URL */ }
  try { const x = new URL(u, location.href); return `${method} ${x.host}${x.pathname}` } catch { return `${method} ${u.split("?")[0]}` }
}

export const statusMsg = (s: number) =>
  s === 404 ? t("errors.http.notFound")
  : s === 401 || s === 403 ? t("errors.http.denied", { status: s })
  : s === 429 ? t("errors.http.tooMany")
  : s >= 500 ? t("errors.http.server", { status: s })
  : t("errors.http.other", { status: s })

export const corsHint = () => t("errors.cors")

/** Turn any thrown value into a sentence a viewer can act on, and record it in the error log (Settings > Logs) with what it was about (`ctx`). */
export function explain(e: unknown, ctx?: string): string {
  const net = e instanceof HttpError || (e instanceof DOMException && e.name === "AbortError") || e instanceof TypeError
  const msg = e instanceof HttpError ? statusMsg(e.status)
    : e instanceof DOMException && e.name === "AbortError" ? t("errors.timeout")
    : e instanceof TypeError ? corsHint()
    : e instanceof Error ? e.message : String(e)
  // the row reads as what the viewer saw; the raw error (status, URL, body, stack) rides along as facts
  const raw = describeError(e)
  logError(msg, { kind: net ? "network" : undefined, ctx, detail: raw.detail, data: { ...errorFacts(e), error: raw.msg !== msg ? raw.msg : undefined } })
  return msg
}

const bodyOf = async (r: Response) => { try { return (await r.text()).slice(0, 1500) } catch { return undefined } }

/** fetch with a timeout (AbortSignal.timeout is Chrome 103; webOS 23 is Chromium 94). Throws HttpError on a non-2xx answer.
 *  Every failure is logged as a warning (method, URL, status, start of the body) unless `o.probe`: discovery calls that are expected to miss (LAN scan, address detection). */
export async function fetchT(url: string, ms = 60000, init?: RequestInit, o?: { probe?: boolean }): Promise<Response> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  const method = (init?.method ?? "GET").toUpperCase()
  try {
    const r = await fetch(url, { ...init, signal: c.signal })
    if (!r.ok) throw new HttpError(r.status, url, method, await bodyOf(r))
    return r
  } catch (e) {
    if (e instanceof Error && !(e instanceof HttpError)) Object.assign(e, { url, method }, e.name === "AbortError" ? { timeout: `${ms} ms` } : {}) // a timeout / CORS failure says which request
    if (!o?.probe) logError(e, { level: "warn", kind: "network", ctx: reqCtx(method, url), data: e instanceof Error && e.name === "AbortError" ? { timeout: `${ms} ms` } : undefined })
    throw e
  } finally {
    clearTimeout(t)
  }
}

/** A paged list (Plex / Jellyfin libraries): the first page says how many there are, the others are fetched 3 at a time
    (a TV waits on round trips, not on the server). Items come back in page order. */
export async function paged<T>(size: number, page: (start: number) => Promise<{ list: T[]; total?: number }>, progress: (done: number, total: number) => void): Promise<T[]> {
  const first = await page(0)
  const total = first.total ?? first.list.length
  const out = first.list.slice()
  const starts: number[] = []
  for (let st = size; first.list.length && st < total; st += size) starts.push(st)
  progress(Math.min(size, total), total)
  for (let i = 0; i < starts.length; i += 3) {
    const got = await Promise.all(starts.slice(i, i + 3).map(page))
    for (const p of got) for (const x of p.list) out.push(x)
    progress(Math.min(starts[Math.min(i + 3, starts.length) - 1] + size, total), total)
  }
  return out
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
export async function plexFetch(url: string, proxy: string, init?: RequestInit, ms = 30000, o?: { probe?: boolean }): Promise<Response> {
  if (mixed(url)) return fetchT(px(url, proxy), ms, init, o)
  try {
    return await fetchT(url, ms, init, o)
  } catch (e) {
    const p = px(url, proxy)
    if (!(e instanceof TypeError) || p === url) throw e
    return fetchT(p, ms, init, o)
  }
}

/** This device's own /24 prefixes via a WebRTC host candidate (webOS and most browsers expose the LAN address; Chrome may hide it behind mDNS, then this is []). */
function rtcSubnets(): Promise<string[]> {
  return new Promise((res) => {
    const out = new Set<string>()
    let pc: RTCPeerConnection | undefined
    const done = () => { try { pc?.close() } catch { /* closed */ } res([...out]) }
    try {
      pc = new RTCPeerConnection({ iceServers: [] })
      pc.createDataChannel("")
      pc.onicecandidate = (e) => {
        if (!e.candidate) return done()
        const ip = e.candidate.candidate.split(" ")[4] ?? ""
        const m = /^(\d+\.\d+\.\d+)\.\d+$/.exec(ip)
        if (m && !/^(0|127|169)\./.test(m[1])) out.add(m[1])
      }
      pc.createOffer().then((o) => pc!.setLocalDescription(o)).catch(done)
      setTimeout(done, 800)
    } catch { res([]) }
  })
}

/** Sweep the likely home subnets (the page's own /24 first, then the usual router defaults) for a server on `port`.
    Browsers can't do UDP discovery or read their LAN address, so this is a plain /24 probe: ~250 hosts per subnet, 80 at a time.
    Direct requests only (an https page can't reach http hosts, and the /p proxy may sit on another network), so it returns [] there. */
export async function scanLan(port: number, probe: (base: string) => Promise<string | null>, onProgress?: (pct: number) => void): Promise<{ server: string; name: string }[]> {
  if (location.protocol === "https:") return []
  const own = /^(\d+\.\d+\.\d+)\.\d+$/.exec(location.hostname)?.[1]
  const subnets = [...new Set([...(await rtcSubnets()), own, "192.168.1", "192.168.0", "10.0.0", "192.168.68", "10.0.1", "192.168.2"].filter((x): x is string => !!x))]
  const hosts = subnets.flatMap((s) => Array.from({ length: 254 }, (_, i) => `${s}.${i + 1}`))
  const out: { server: string; name: string }[] = []
  let next = 0, done = 0
  const worker = async () => {
    while (next < hosts.length) {
      const h = hosts[next++], server = `http://${h}:${port}`
      try { const name = await probe(server); if (name) out.push({ server, name }) } catch { /* closed or no route */ }
      onProgress?.(Math.round((++done / hosts.length) * 100))
    }
  }
  await Promise.all(Array.from({ length: 80 }, worker))
  return out
}
