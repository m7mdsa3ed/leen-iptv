// Pure error-log core (no '@/' imports, no DOM) so `node scripts/errlog.check.ts` can run it:
// redaction, de-duplication (a repeat bumps a counter instead of adding a row), caps, and the plain-text export.
import { redact } from "./diagnostics/redact.ts"

/** crash = a page threw while rendering; uncaught = window error / unhandled rejection; network = HTTP, CORS, timeout; playback = the player's final error. */
export type ErrKind = "crash" | "uncaught" | "network" | "playback" | "error"
export const ERR_KINDS: readonly ErrKind[] = ["crash", "uncaught", "network", "playback", "error"]
/** One row. `n` = how many times the same kind + message + context happened; `at` = first time, `last` = latest. */
export type ErrEntry = { id: string; kind: ErrKind; msg: string; detail?: string; ctx?: string; route?: string; at: number; last: number; n: number }
export type ErrInput = { kind: ErrKind; msg: string; detail?: string; ctx?: string; route?: string }

export const ERR_MAX = 200
export const ERR_DAYS = 14
const DAY = 864e5
const DETAIL_MAX = 4000
// browser noise that is not an app error
const IGNORE = /ResizeObserver loop|^Script error\.?$/i

const clean = (s: string | undefined, max: number) => {
  const v = s ? redact(s).trim() : ""
  return v ? (v.length > max ? v.slice(0, max) + "..." : v) : undefined
}

/** Drop rows older than ERR_DAYS (by their latest occurrence) and keep the newest ERR_MAX. */
export function pruneErrors(list: ErrEntry[], now: number): ErrEntry[] {
  const old = now - ERR_DAYS * DAY
  return list.filter((e) => e.last > old).slice(0, ERR_MAX)
}

/** The log with `e` on top (newest first), or null when it is ignored noise. Secrets are redacted before anything is kept. */
export function addError(list: ErrEntry[], e: ErrInput, now: number): ErrEntry[] | null {
  const msg = clean(e.msg, 500)
  if (!msg || IGNORE.test(msg)) return null
  const ctx = clean(e.ctx, 120), route = clean(e.route, 200), detail = clean(e.detail, DETAIL_MAX)
  const rest = pruneErrors(list, now)
  const i = rest.findIndex((x) => x.kind === e.kind && x.msg === msg && x.ctx === ctx)
  if (i >= 0) {
    const prev = rest[i]
    const next: ErrEntry = { ...prev, n: prev.n + 1, last: now, route: route ?? prev.route, detail: detail ?? prev.detail }
    return [next, ...rest.slice(0, i), ...rest.slice(i + 1)]
  }
  const row: ErrEntry = { id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, kind: e.kind, msg, at: now, last: now, n: 1 }
  if (detail && detail !== msg) row.detail = detail
  if (ctx) row.ctx = ctx
  if (route) row.route = route
  return [row, ...rest].slice(0, ERR_MAX)
}

/** Message + stack of any thrown value, without assuming it is an Error. */
export function describeError(e: unknown): { msg: string; detail?: string } {
  if (e instanceof Error) return { msg: `${e.name && e.name !== "Error" ? e.name + ": " : ""}${e.message || e.name}`, detail: e.stack }
  if (typeof e === "string") return { msg: e }
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; type?: unknown }
    if (typeof o.message === "string") return { msg: o.message }
    try { return { msg: JSON.stringify(e).slice(0, 500) } } catch { /* circular */ }
  }
  return { msg: String(e) }
}

/** Plain-text export (copy / download), oldest last. `head` = lines about the app and device. */
export function errorsText(list: ErrEntry[], head: string[]): string {
  const iso = (n: number) => new Date(n).toISOString().replace(".000Z", "Z")
  const rows = list.map((e) => {
    const when = e.n > 1 ? `${iso(e.last)} (x${e.n}, first ${iso(e.at)})` : iso(e.last)
    const where = [e.ctx, e.route].filter(Boolean).join(" @ ")
    const lines = [`${when} [${e.kind}] ${e.msg}${where ? ` - ${where}` : ""}`]
    if (e.detail) lines.push(...e.detail.split("\n").map((l) => "    " + l))
    return lines.join("\n")
  })
  return [...head, `${list.length} entries`, "", ...rows].join("\n")
}
