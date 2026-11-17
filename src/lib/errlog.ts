import { create } from "zustand"
import { del, get, set } from "idb-keyval"
import pkg from "../../package.json"
import { addError, consoleMessage, describeError, errorFacts, mergeErrors, type ErrEntry, type ErrKind, type ErrLevel, type FactsIn } from "./errlog-pure"

/* The error log: every error and swallowed failure in the app, device-local (IndexedDB `leen-errors`, never synced), newest first,
   500 rows / 30 days, repeats counted on one row (with their last 20 times), secrets redacted before they are kept (errlog-pure.ts).
   Settings > Logs lists it, `#/log/<id>` shows one entry. */
const KEY = "leen-errors"
const OLD = "leen-errors" // localStorage, builds before the IndexedDB log
export const useErrors = create<{ list: ErrEntry[]; ready: boolean }>(() => ({ list: [], ready: false }))

// rows logged while the saved log is still being read are merged into it; nothing is written before that, so a slow read never loses the saved log
let loaded = false
const boot = (async () => {
  let saved: ErrEntry[] = []
  try { saved = (await get<ErrEntry[]>(KEY)) ?? [] } catch (e) { queueMicrotask(() => logError(e, { kind: "storage", level: "warn", ctx: "Error log" })) }
  try { const o = JSON.parse(localStorage.getItem(OLD) || "null") as ErrEntry[] | null; if (Array.isArray(o)) { saved = [...saved, ...o]; localStorage.removeItem(OLD) } } catch { /* nothing to migrate */ }
  loaded = true
  useErrors.setState((s) => ({ list: mergeErrors(Array.isArray(saved) ? saved : [], s.list, Date.now()), ready: true }))
})()
export const errorsReady = () => boot

// a burst of errors writes once; a page that is going away writes at once
let timer = 0
const save = () => {
  clearTimeout(timer); timer = 0
  if (!loaded) return
  void set(KEY, useErrors.getState().list).catch(() => { /* IndexedDB gone: the rows stay in memory for this session */ })
}
useErrors.subscribe(() => { if (loaded && !timer) timer = window.setTimeout(save, 1000) })
if (typeof window !== "undefined") window.addEventListener("pagehide", () => { if (timer) save() })

const netKind = (e: unknown): ErrKind | undefined => {
  const n = e instanceof Error || e instanceof DOMException ? e.name : ""
  if (n === "HttpError" || n === "ApiError" || n === "AbortError" || n === "TimeoutError" || n === "NetworkError") return "network"
  if (n === "QuotaExceededError" || n === "DataError" || n === "VersionError" || n === "UnknownError") return "storage"
  if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)) return "network"
  return undefined
}

let busy = false
/**
 * Record an error. `e` = anything thrown (or a message). `kind` defaults to network for HTTP / CORS / timeout errors, storage for quota errors, else error;
 * `level` warn = the app carried on (a retry, a background job); `ctx` = what it was about (a source, a title); `data` = extra facts for the detail page.
 * Facts of the error itself (HTTP status, URL, method, response body, codes, cause) are added automatically.
 */
export function logError(e: unknown, o?: { kind?: ErrKind; level?: ErrLevel; ctx?: string; detail?: string; data?: FactsIn }) {
  if (busy) return // an error while logging must not log itself
  busy = true
  try {
    const d = describeError(e)
    const data: FactsIn = { ...errorFacts(e), ...o?.data, online: navigator.onLine === false ? "no (offline)" : undefined, version: pkg.version }
    const next = addError(useErrors.getState().list, { kind: o?.kind ?? netKind(e) ?? "error", level: o?.level, msg: d.msg, detail: o?.detail ?? d.detail, ctx: o?.ctx, route: location.hash || undefined, data }, Date.now())
    if (next) useErrors.setState({ list: next })
  } catch { /* never let logging break the caller */ } finally { busy = false }
}

/** A `.catch` handler for a failure the app carries on from: logged as a warning (`ctx` = what was being done), nothing shown. */
export const logQuiet = (ctx: string, kind?: ErrKind) => (e: unknown) => logError(e, { level: "warn", ctx, kind })

export const clearErrors = () => useErrors.setState({ list: [] })
export const deleteError = (id: string) => useErrors.setState((s) => ({ list: s.list.filter((e) => e.id !== id) }))
/** Wipes the stored copy too (for a reset that cannot wait for the debounced write). */
export const dropErrors = () => { clearErrors(); void del(KEY).catch(() => {}) }

/** Uncaught errors, unhandled rejections, scripts / styles that failed to load, and console.error / console.warn. Installed once, before the first render (main.tsx). */
export function installErrorLog() {
  window.addEventListener("error", (ev) => {
    if (ev.target instanceof Element) { // resource errors only reach a capturing listener; images, video and audio are left out (a missing poster is not an error, the player logs its own)
      const el = ev.target
      if (el.tagName !== "SCRIPT" && el.tagName !== "LINK") return
      return logError(`Could not load ${el.tagName === "SCRIPT" ? "script" : "stylesheet"}`, { kind: "network", data: { url: (el as HTMLScriptElement).src || (el as HTMLLinkElement).href } })
    }
    const at = ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : undefined
    logError(ev.error ?? ev.message, { kind: "uncaught", detail: ev.error instanceof Error ? ev.error.stack : at, data: { at } })
  }, true)
  window.addEventListener("unhandledrejection", (ev) => logError(ev.reason, { kind: netKind(ev.reason) ?? "uncaught" }))
  for (const [m, level] of [["error", "error"], ["warn", "warn"]] as const) {
    const orig = console[m].bind(console)
    console[m] = (...args: unknown[]) => {
      orig(...args)
      const c = consoleMessage(args)
      logError(c.msg, { kind: "console", level, detail: c.detail ?? new Error().stack?.split("\n").slice(2).join("\n") })
    }
  }
}
