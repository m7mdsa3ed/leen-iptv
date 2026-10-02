// Tiny network probes for the diagnostics checks. Chrome 94 safe (AbortController, no AbortSignal.timeout).
import { mixed } from "@/lib/net"
import { t } from "@/lib/i18n"

export type Kind = "ok" | "http" | "cors" | "net" | "mixed" | "timeout"
export type Probe = { kind: Kind; status?: number; ms: number; bytes: number; text?: string; type?: string; url?: string; kbps?: number }

/** Is the host reachable at all? (opaque no-cors request; true = something answered, so a failed CORS fetch means missing CORS headers) */
async function reachable(url: string): Promise<boolean> {
  const c = new AbortController()
  const timer = setTimeout(() => c.abort(), 4000)
  try { await fetch(url, { mode: "no-cors", signal: c.signal }); return true } catch { return false } finally { clearTimeout(timer); c.abort() }
}

/** GET `url` (CORS mode), read at most `read` bytes, then close the connection. Never throws. */
export async function probe(url: string, o: { ms?: number; read?: number; text?: boolean; init?: RequestInit } = {}): Promise<Probe> {
  const { ms = 7000, read = 2048, text = false, init } = o
  if (mixed(url)) return { kind: "mixed", ms: 0, bytes: 0 }
  const t0 = performance.now()
  const c = new AbortController()
  const timer = setTimeout(() => c.abort(), ms)
  let hdr = 0
  try {
    const r = await fetch(url, { ...init, signal: c.signal })
    hdr = performance.now() - t0
    if (!r.ok) return { kind: "http", status: r.status, ms: hdr, bytes: 0, url: r.url }
    const chunks: Uint8Array[] = []
    let n = 0
    const rd = r.body?.getReader()
    const t1 = performance.now()
    while (rd && n < read) {
      const { done, value } = await rd.read()
      if (done) break
      chunks.push(value); n += value.length
    }
    const body = performance.now() - t1
    const all = new Uint8Array(n)
    let off = 0
    for (const ch of chunks) { all.set(ch, off); off += ch.length }
    return {
      kind: "ok", status: r.status, ms: hdr, bytes: n, type: r.headers.get("content-type") ?? "", url: r.url,
      text: text ? new TextDecoder().decode(all) : undefined,
      kbps: n > 16384 && body > 5 ? Math.round((n * 8) / body) : undefined, // bits per ms = kbit/s
    }
  } catch (e) {
    const ms2 = performance.now() - t0
    if (e instanceof DOMException && e.name === "AbortError") return { kind: "timeout", ms: ms2, bytes: 0 }
    return { kind: (await reachable(url)) ? "cors" : "net", ms: ms2, bytes: 0 }
  } finally {
    clearTimeout(timer)
    c.abort() // closes the stream: many providers allow only 1-2 connections
  }
}

/** One plain sentence for a failed (or ok) probe. */
export function say(p: Probe | undefined): string {
  if (!p) return ""
  switch (p.kind) {
    case "ok": return t("diag.p.ok", { ms: Math.round(p.ms) })
    case "cors": return t("diag.p.cors")
    case "mixed": return t("diag.p.mixed")
    case "timeout": return t("diag.p.timeout")
    case "net": return t("diag.p.net")
    default: return httpSay(p.status ?? 0)
  }
}

export const httpSay = (s: number) =>
  s === 404 ? t("diag.http.404") : s === 401 || s === 403 ? t("diag.http.denied", { status: s }) : s === 429 ? t("diag.http.429")
  : s >= 500 ? t("diag.http.5xx", { status: s }) : t("diag.http.other", { status: s })

/** Race a promise against a deadline (the work keeps running but its result is ignored). */
export const within = <T,>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> =>
  new Promise((res, rej) => { const id = setTimeout(() => res(onTimeout()), ms); p.then((v) => { clearTimeout(id); res(v) }, (e) => { clearTimeout(id); rej(e) }) })
