import { create } from "zustand"
import { addError, describeError, pruneErrors, type ErrEntry, type ErrKind } from "./errlog-pure"

/* The error log: every error the app shows or catches, device-local (localStorage `leen-errors`, never synced), newest first,
   200 rows / 14 days, repeats counted on one row, secrets redacted before they are kept (errlog-pure.ts). Settings > Logs reads it. */
const KEY = "leen-errors"
const load = (): ErrEntry[] => {
  try { const l = JSON.parse(localStorage.getItem(KEY) || "null") as ErrEntry[] | null; if (Array.isArray(l)) return pruneErrors(l, Date.now()) } catch { /* ignore */ }
  return []
}
export const useErrors = create<{ list: ErrEntry[] }>(() => ({ list: load() }))

// a burst of errors writes once; a page that is going away writes at once
let timer = 0
const save = () => { clearTimeout(timer); timer = 0; try { localStorage.setItem(KEY, JSON.stringify(useErrors.getState().list)) } catch { /* full / private mode */ } }
useErrors.subscribe(() => { if (!timer) timer = window.setTimeout(save, 1000) })
if (typeof window !== "undefined") window.addEventListener("pagehide", () => { if (timer) save() })

const netKind = (e: unknown): ErrKind | undefined => {
  if (e instanceof Error && (e.name === "HttpError" || e.name === "AbortError")) return "network"
  if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)) return "network"
  return undefined
}

let busy = false
/** Record an error. `e` = anything thrown (or a message); `kind` defaults to network for HTTP / CORS / timeout errors, else error; `ctx` = what it was about (a source, a title). */
export function logError(e: unknown, o?: { kind?: ErrKind; ctx?: string; detail?: string }) {
  if (busy) return // an error while logging must not log itself
  busy = true
  try {
    const d = describeError(e)
    const next = addError(useErrors.getState().list, { kind: o?.kind ?? netKind(e) ?? "error", msg: d.msg, detail: o?.detail ?? d.detail, ctx: o?.ctx, route: location.hash || undefined }, Date.now())
    if (next) useErrors.setState({ list: next })
  } catch { /* never let logging break the caller */ } finally { busy = false }
}

export const clearErrors = () => useErrors.setState({ list: [] })

/** Uncaught errors and unhandled promise rejections anywhere in the app. Installed once, before the first render (main.tsx). */
export function installErrorLog() {
  window.addEventListener("error", (ev) => {
    const at = ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : ""
    logError(ev.error ?? ev.message, { kind: "uncaught", detail: ev.error instanceof Error ? ev.error.stack : at || undefined })
  })
  window.addEventListener("unhandledrejection", (ev) => logError(ev.reason, { kind: netKind(ev.reason) ?? "uncaught" }))
}
