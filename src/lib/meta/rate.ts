import { HttpError } from "../net"

/** Provider request log for the metadata activity panel: requests in the last minute, today (kept on the device, the day rolls at local midnight),
    and the last time a provider answered 429 (rate limited). Only real network calls are counted: cached answers never reach `counted`. */
export const DAILY: Record<string, number> = { omdb: 1000, watchmode: 80 } // free-tier daily caps; TMDB has none (about 50 requests a second); Watchmode free plan is about 2,500 requests a month
const KEY = "leen-api-count"
const today = () => new Date().toDateString()
const load = (): { day: string; n: Record<string, number> } => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v?.day === today()) return v } catch { /* corrupt: start over */ } return { day: today(), n: {} } }
let day = load()
const recent: Record<string, number[]> = {}
const limited: Record<string, number> = {}

export async function counted<T>(id: string, f: () => Promise<T>): Promise<T> {
  const now = Date.now()
  if (day.day !== today()) day = { day: today(), n: {} }
  day.n[id] = (day.n[id] ?? 0) + 1
  try { localStorage.setItem(KEY, JSON.stringify(day)) } catch { /* private mode */ }
  ;(recent[id] ??= []).push(now)
  try { return await f() } catch (e) { if (e instanceof HttpError && e.status === 429) limited[id] = Date.now(); throw e }
}

/** Per provider that made a request: last minute, today, the daily cap (if any) and when it last said 429. */
export function rateSnapshot() {
  const cut = Date.now() - 60000
  if (day.day !== today()) day = { day: today(), n: {} }
  return [...new Set([...Object.keys(day.n), ...Object.keys(recent)])].map((id) => {
    const r = (recent[id] = (recent[id] ?? []).filter((t) => t > cut))
    return { id, perMin: r.length, today: day.n[id] ?? 0, cap: DAILY[id], limitedAt: limited[id] }
  })
}
