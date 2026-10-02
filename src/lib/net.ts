import { t } from "./i18n"
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
  s === 404 ? t("errors.http.notFound")
  : s === 401 || s === 403 ? t("errors.http.denied", { status: s })
  : s === 429 ? t("errors.http.tooMany")
  : s >= 500 ? t("errors.http.server", { status: s })
  : t("errors.http.other", { status: s })

export const corsHint = () => t("errors.cors")

/** Turn any thrown value into a sentence a viewer can act on. */
export function explain(e: unknown): string {
  if (e instanceof HttpError) return statusMsg(e.status)
  if (e instanceof DOMException && e.name === "AbortError") return t("errors.timeout")
  if (e instanceof TypeError) return corsHint()
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
