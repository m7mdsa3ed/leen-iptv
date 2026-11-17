// Pure error-log core (no '@/' imports, no DOM) so `node scripts/errlog.check.ts` can run it:
// redaction, de-duplication (a repeat bumps a counter instead of adding a row), caps, merging, facts and the plain-text export.
import { redact } from "./diagnostics/redact.ts"

/** crash = a page threw while rendering; uncaught = window error / unhandled rejection; network = HTTP, CORS, timeout, a script that did not load;
 *  playback = the player and its engines; storage = IndexedDB / localStorage; console = console.error / console.warn; error = anything else. */
export type ErrKind = "crash" | "uncaught" | "network" | "playback" | "storage" | "console" | "error"
export const ERR_KINDS: readonly ErrKind[] = ["crash", "uncaught", "network", "playback", "storage", "console", "error"]
/** warn = something failed but the app recovered or carried on (an engine retry, a background lookup); error = the rest. */
export type ErrLevel = "error" | "warn"
export type Facts = Record<string, string>
/** One row. `n` = how many times the same kind + level + message + context happened; `at` = first time, `last` = latest, `times` = the latest TIMES_MAX, newest first.
 *  `data` = facts about the latest occurrence (HTTP status, URL, method, response body, codes, online...). */
export type ErrEntry = { id: string; kind: ErrKind; level: ErrLevel; msg: string; detail?: string; ctx?: string; route?: string; data?: Facts; at: number; last: number; n: number; times: number[] }
export type FactsIn = Record<string, string | number | boolean | null | undefined>
export type ErrInput = { kind: ErrKind; level?: ErrLevel; msg: string; detail?: string; ctx?: string; route?: string; data?: FactsIn }

export const ERR_MAX = 500
export const ERR_DAYS = 30
export const TIMES_MAX = 20
const DAY = 864e5
const DETAIL_MAX = 8000
const FACT_MAX = 1500
// browser noise that is not an app error
const IGNORE = /ResizeObserver loop|^Script error\.?$/i

const clean = (s: string | undefined, max: number) => {
  const v = s ? redact(s).trim() : ""
  return v ? (v.length > max ? v.slice(0, max) + "..." : v) : undefined
}
const cleanFacts = (d: FactsIn | undefined): Facts | undefined => {
  if (!d) return undefined
  const out: Facts = {}
  for (const k in d) { const v = d[k]; if (v === undefined || v === null || v === "") continue; const c = clean(String(v), FACT_MAX); if (c) out[k] = c }
  return Object.keys(out).length ? out : undefined
}
type Key = { kind: ErrKind; level: ErrLevel; msg: string; ctx?: string }
const same = (a: Key, b: Key) => a.kind === b.kind && a.level === b.level && a.msg === b.msg && a.ctx === b.ctx

/** Drop rows older than ERR_DAYS (by their latest occurrence) and keep the newest ERR_MAX. */
export function pruneErrors(list: ErrEntry[], now: number): ErrEntry[] {
  const old = now - ERR_DAYS * DAY
  return list.filter((e) => e.last > old).slice(0, ERR_MAX)
}

/** The log with `e` on top (newest first), or null when it is ignored noise. Secrets are redacted before anything is kept. */
export function addError(list: ErrEntry[], e: ErrInput, now: number): ErrEntry[] | null {
  const msg = clean(e.msg, 500)
  if (!msg || IGNORE.test(msg)) return null
  const level = e.level ?? "error"
  const ctx = clean(e.ctx, 160), route = clean(e.route, 300), detail = clean(e.detail, DETAIL_MAX), data = cleanFacts(e.data)
  const rest = pruneErrors(list, now)
  const i = rest.findIndex((x) => same(x, { kind: e.kind, level, msg, ctx }))
  if (i >= 0) {
    const prev = rest[i]
    const next: ErrEntry = { ...prev, n: prev.n + 1, last: now, times: [now, ...prev.times].slice(0, TIMES_MAX), route: route ?? prev.route, detail: detail ?? prev.detail, data: data ?? prev.data }
    return [next, ...rest.slice(0, i), ...rest.slice(i + 1)]
  }
  const row: ErrEntry = { id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, kind: e.kind, level, msg, at: now, last: now, n: 1, times: [now] }
  if (detail && detail !== msg) row.detail = detail
  if (ctx) row.ctx = ctx
  if (route) row.route = route
  if (data) row.data = data
  return [row, ...rest].slice(0, ERR_MAX)
}

/** Rows logged before the saved log was read (`mem`, newest first) folded into it: a repeat adds its count and times to the saved row.
 *  Saved rows from older builds (no level / times) are filled in. */
export function mergeErrors(saved: ErrEntry[], mem: ErrEntry[], now: number): ErrEntry[] {
  let out = pruneErrors(saved.map((e) => ({ ...e, level: e.level ?? "error", times: e.times ?? [e.last] })), now)
  for (const m of [...mem].reverse()) {
    const i = out.findIndex((x) => same(x, m))
    if (i < 0) { out = [m, ...out]; continue }
    const p = out[i]
    const merged: ErrEntry = { ...p, ...m, id: p.id, at: Math.min(p.at, m.at), n: p.n + m.n, times: [...m.times, ...p.times].sort((a, b) => b - a).slice(0, TIMES_MAX) }
    out = [merged, ...out.slice(0, i), ...out.slice(i + 1)]
  }
  return out.slice(0, ERR_MAX)
}

/** Message + stack of any thrown value, without assuming it is an Error. */
export function describeError(e: unknown): { msg: string; detail?: string } {
  if (e instanceof Error) return { msg: `${e.name && e.name !== "Error" ? e.name + ": " : ""}${e.message || e.name}`, detail: e.stack }
  if (typeof e === "string") return { msg: e }
  if (e && typeof e === "object") {
    const o = e as { message?: unknown }
    if (typeof o.message === "string") return { msg: o.message }
    try { return { msg: JSON.stringify(e).slice(0, 500) } } catch { /* circular */ }
  }
  return { msg: String(e) }
}

/** What a thrown value carries besides its message: HttpError / ApiError (status, url, method, body), DOMException / MediaError codes, `cause`. */
export function errorFacts(e: unknown): FactsIn {
  if (!e || typeof e !== "object") return {}
  const o = e as { name?: unknown; status?: unknown; url?: unknown; method?: unknown; body?: unknown; code?: unknown; cause?: unknown }
  const f: FactsIn = {}
  if (typeof o.name === "string" && o.name !== "Error") f.type = o.name
  if (typeof o.status === "number") f.status = o.status
  if (typeof o.method === "string") f.method = o.method
  if (typeof o.url === "string") f.url = o.url
  if (typeof o.code === "number" || typeof o.code === "string") f.code = o.code
  if (typeof o.body === "string") f.body = o.body
  if (o.cause !== undefined) f.cause = describeError(o.cause).msg
  return f
}

/** One console.error / console.warn call as a message: printf placeholders filled, Errors by message (the first one's stack becomes the detail). */
export function consoleMessage(args: unknown[]): { msg: string; detail?: string } {
  let detail: string | undefined
  const parts = args.map((a) => {
    if (a instanceof Error) { detail ??= a.stack; return describeError(a).msg }
    if (typeof a === "string") return a
    try { return JSON.stringify(a) ?? String(a) } catch { return String(a) }
  })
  let k = 1
  const head = (parts[0] ?? "").replace(/%[sdifoOc]/g, (m) => (m === "%c" ? (k++, "") : k < parts.length ? parts[k++] : m))
  return { msg: [head, ...parts.slice(k)].join(" ").trim(), detail }
}

/** Plain-text export (copy / download), newest first. `head` = lines about the app and device. */
export function errorsText(list: ErrEntry[], head: string[]): string {
  const iso = (n: number) => new Date(n).toISOString().replace(".000Z", "Z")
  const rows = list.map((e) => {
    const when = e.n > 1 ? `${iso(e.last)} (x${e.n}, first ${iso(e.at)})` : iso(e.last)
    const where = [e.ctx, e.route].filter(Boolean).join(" @ ")
    const lines = [`${when} [${e.kind}${e.level === "warn" ? "/warn" : ""}] ${e.msg}${where ? ` - ${where}` : ""}`]
    for (const k in e.data ?? {}) lines.push(`    ${k}: ${e.data![k].replace(/\n/g, "\n      ")}`)
    if (e.n > 1) lines.push(`    times: ${e.times.map(iso).join(", ")}`)
    if (e.detail) lines.push(...e.detail.split("\n").map((l) => "    " + l))
    return lines.join("\n")
  })
  return [...head, `${list.length} entries`, "", ...rows].join("\n")
}
