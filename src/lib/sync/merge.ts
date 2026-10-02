// Pure sync core (no alias imports, no DOM) so `node scripts/sync.check.ts` can run it.
// Everything is a flat map of timestamped entities; merge = per-key last-writer-wins with tombstones.
export type Ent = { t: number; del?: 1; v?: unknown }
export type Prog = { pos: number; dur: number; t: number }
export type Day = { sec: number; sessions: number; live: number; movie: number; series: number }
/** keys: p/<profileId> s/<sourceId> f/<profileId>/<itemId> r/<profileId>/<itemId> c/<setting> */
export type Snapshot = { v: 1; e: Record<string, Ent>; progress: Record<string, Prog>; days: Record<string, Day> }
/** local stamp bookkeeping: h = hash of the value when it was last stamped */
export type Stamp = { t: number; del?: 1; h: string }

export const emptySnap = (): Snapshot => ({ v: 1, e: {}, progress: {}, days: {} })

export function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(",")}]`
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`
  }
  return JSON.stringify(x) ?? "null"
}

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + s.length }

const pickEnt = (a: Ent, b: Ent): Ent => {
  if (a.t !== b.t) return a.t > b.t ? a : b
  if (!!a.del !== !!b.del) return a.del ? a : b // delete wins a tie
  return stable(a) >= stable(b) ? a : b
}
const pickProg = (a: Prog, b: Prog): Prog => (a.t !== b.t ? (a.t > b.t ? a : b) : stable(a) >= stable(b) ? a : b)
const maxDay = (a: Day, b: Day): Day => ({ sec: Math.max(a.sec, b.sec), sessions: Math.max(a.sessions, b.sessions), live: Math.max(a.live, b.live), movie: Math.max(a.movie, b.movie), series: Math.max(a.series, b.series) })

function mergeMap<T>(a: Record<string, T>, b: Record<string, T>, pick: (x: T, y: T) => T) {
  const o: Record<string, T> = { ...a }
  for (const k in b) o[k] = k in a ? pick(a[k], b[k]) : b[k]
  return o
}

export const merge = (a: Snapshot, b: Snapshot): Snapshot => ({ v: 1, e: mergeMap(a.e, b.e, pickEnt), progress: mergeMap(a.progress, b.progress, pickProg), days: mergeMap(a.days, b.days, maxDay) })

// ---- app state <-> flat entities ----
type P = { id: string }
export type AppSlice = {
  profiles: P[]
  sources: P[]
  data: Record<string, { favs: string[]; recents: string[]; progress: Record<string, Prog> }>
  settings: { theme?: unknown; trackHistory?: unknown; meta?: unknown } & Partial<Record<DisplayKey, unknown>>
}
/** Display preferences that follow the account. Only written once set (an untouched device never overwrites a customised one); "reset" stores an empty value, not undefined. */
export const DISPLAY_KEYS = ["cardSize", "cardInfo", "startPage", "homeOrder", "homeHide", "catNav"] as const
type DisplayKey = (typeof DISPLAY_KEYS)[number]
export const RECENTS_MAX = 40

/** Current synced values keyed like Snapshot.e, with a hash for change detection. */
export function flatten(s: AppSlice): Record<string, { h: string; v?: unknown }> {
  const o: Record<string, { h: string; v?: unknown }> = {}
  const put = (k: string, v: unknown) => { o[k] = { h: hash(stable(v)), v } }
  s.profiles.forEach((p) => put(`p/${p.id}`, p))
  s.sources.forEach((x) => put(`s/${x.id}`, x))
  for (const pid in s.data) {
    if (!s.profiles.some((p) => p.id === pid)) continue
    const d = s.data[pid]
    d.favs.forEach((id) => (o[`f/${pid}/${id}`] = { h: "1" }))
    d.recents.forEach((id, i) => (o[`r/${pid}/${id}`] = { h: i === 0 ? "0" : "1" })) // re-pushing to the top restamps
  }
  put("c/theme", s.settings.theme ?? null)
  put("c/trackHistory", s.settings.trackHistory ?? null)
  put("c/meta", s.settings.meta ?? null)
  for (const k of DISPLAY_KEYS) if (s.settings[k] !== undefined) put(`c/${k}`, s.settings[k])
  put("c/sourceOrder", s.sources.map((x) => x.id))
  return o
}

/** Diff current state against stamps: new/changed -> t=now, vanished -> tombstone. Returns a new map (or the same one if nothing changed). */
export function stamp(e: Record<string, Stamp>, flat: Record<string, { h: string }>, now: number): Record<string, Stamp> {
  let out = e
  const set = (k: string, v: Stamp) => { if (out === e) out = { ...e }; out[k] = v }
  for (const k in flat) { const c = e[k]; if (!c || c.del || c.h !== flat[k].h) set(k, { t: now, h: flat[k].h }) }
  for (const k in e) if (!(k in flat) && !e[k].del) set(k, { t: now, del: 1, h: "" })
  return out
}

const TOMB_TTL = 180 * 864e5
/** Local state + stamps -> snapshot. */
export function buildSnapshot(s: AppSlice, st: Record<string, Stamp>, days: Record<string, Day>, now: number): Snapshot {
  const flat = flatten(s)
  const e: Record<string, Ent> = {}
  for (const k in st) {
    const x = st[k]
    if (x.del) { if (now - x.t < TOMB_TTL) e[k] = { t: x.t, del: 1 } } else if (k in flat) e[k] = { t: x.t, v: flat[k].v ?? null }
  }
  const progress: Record<string, Prog> = {}
  for (const pid in s.data) if (s.profiles.some((p) => p.id === pid)) for (const id in s.data[pid].progress) progress[`${pid}/${id}`] = s.data[pid].progress[id]
  return { v: 1, e, progress, days }
}

const split = (k: string) => { const i = k.indexOf("/", 2); return [k.slice(2, i), k.slice(i + 1)] as const }

/** Merged snapshot -> new app slice (keeps local ordering, new things appended) + the stamps that describe it. */
export function applySnapshot(cur: AppSlice, m: Snapshot): { slice: AppSlice; days: Record<string, Day>; stamps: Record<string, Stamp> } {
  const alive = (k: string) => (m.e[k] && !m.e[k].del ? m.e[k] : null)
  const ids = (pre: string) => Object.keys(m.e).filter((k) => k.startsWith(pre) && alive(k)).map((k) => k.slice(2))
  const ordered = (list: P[], pre: string, order?: string[]) => {
    const want = new Set(ids(pre))
    const have = list.filter((x) => want.has(x.id)).map((x) => x.id)
    const seq = order ? [...order.filter((id) => want.has(id)), ...have.filter((id) => !order.includes(id))] : have
    const rest = [...want].filter((id) => !seq.includes(id)).sort()
    return [...seq, ...rest].map((id) => alive(pre + id)!.v as P)
  }
  const profiles = ordered(cur.profiles, "p/")
  const orderEnt = alive("c/sourceOrder")
  const sources = ordered(cur.sources, "s/", Array.isArray(orderEnt?.v) ? (orderEnt!.v as string[]) : undefined)
  const pset = new Set(profiles.map((p) => p.id))
  const data: AppSlice["data"] = {}
  for (const p of profiles) data[p.id] = { favs: [], recents: [], progress: {} }
  const favT: Record<string, [string, number][]> = {}, recT: Record<string, [string, number][]> = {}
  for (const k in m.e) {
    const x = alive(k)
    if (!x || (k[0] !== "f" && k[0] !== "r") || k[1] !== "/") continue
    const [pid, id] = split(k)
    if (!pset.has(pid)) continue
    ;(k[0] === "f" ? favT : recT)[pid] = [...((k[0] === "f" ? favT : recT)[pid] ?? []), [id, x.t]]
  }
  const localIdx = (pid: string, key: "favs" | "recents", id: string) => { const i = cur.data[pid]?.[key].indexOf(id) ?? -1; return i < 0 ? 1e9 : i }
  for (const pid of pset) {
    // newest first; equal stamps keep this device's order
    const by = (key: "favs" | "recents") => (x: [string, number], y: [string, number]) => y[1] - x[1] || localIdx(pid, key, x[0]) - localIdx(pid, key, y[0]) || (x[0] < y[0] ? -1 : 1)
    data[pid].favs = (favT[pid] ?? []).sort(by("favs")).map((x) => x[0])
    data[pid].recents = (recT[pid] ?? []).sort(by("recents")).slice(0, RECENTS_MAX).map((x) => x[0])
  }
  for (const k in m.progress) {
    const [pid, id] = [k.slice(0, k.indexOf("/")), k.slice(k.indexOf("/") + 1)]
    if (pset.has(pid)) data[pid].progress[id] = m.progress[k]
  }
  const settings = { ...cur.settings }
  for (const key of ["theme", "trackHistory", "meta", ...DISPLAY_KEYS] as const) {
    const x = alive(`c/${key}`)
    if (x) (settings as Record<string, unknown>)[key] = x.v === null ? undefined : x.v
  }
  const slice = { profiles, sources, data, settings }
  const flat = flatten(slice)
  const stamps: Record<string, Stamp> = {}
  for (const k in m.e) {
    const x = m.e[k]
    if (x.del) stamps[k] = { t: x.t, del: 1, h: "" }
    else if (k in flat) stamps[k] = { t: x.t, h: flat[k].h } // alive but orphaned/capped entries are dropped
  }
  const days: Record<string, Day> = {}
  for (const k in m.days) if (pset.has(k.slice(0, k.indexOf("/")))) days[k] = m.days[k]
  return { slice, days, stamps }
}
