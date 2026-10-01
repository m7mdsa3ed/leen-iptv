import { create } from "zustand"
import { del, get, set } from "idb-keyval"
import type { Item, Kind, Prog, Source } from "./types"
import { explain, fetchText, px } from "./net"
import { parseM3U, parseXmltv } from "./parse"
import { loadXtream, xmltvUrl } from "./xtream"
import { loadPlex } from "./plex"
import { jellyfinEpg, loadJellyfin } from "./jellyfin"
import { useApp } from "./store"
import { mergeSources } from "./merge-pure"

const TTL = 12 * 3600_000
const empty = { live: [], movie: [], series: [] } as Record<Kind, string[]>

export type SrcState = { status: "idle" | "loading" | "ready" | "error"; msg: string; count: number }

interface C {
  /** per-source state, by source id */
  sources: Record<string, SrcState>
  /** overall: loading until the first source is ready (then ready, keeps merging); error only when every source failed; idle = no sources */
  status: "idle" | "loading" | "ready" | "error"
  msg: string
  items: Item[] // live (all) + primary movies/series
  byId: Map<string, Item> // EVERY item, alts included
  primaryOf: Map<string, Item> // alt id -> primary
  byKind: Record<Kind, Item[]>
  groups: Record<Kind, string[]>
  epg: Map<string, Prog[]>
  epgTick: number
  /** load every enabled source in parallel (skips ones already loaded unless force); drops removed/disabled ones */
  loadAll: (sources: Source[], proxy: string, force?: boolean) => Promise<void>
  /** (re)load ONE source and merge it (used by Retry) */
  load: (s: Source, proxy: string, force?: boolean) => Promise<void>
  retry: (id: string) => Promise<void>
  forget: (id: string) => void
}

// module state: raw per-source items (never mutated), per-source guides, latest load token per source
const raw = new Map<string, Item[]>()
const epgs = new Map<string, Map<string, Prog[]>>()
const tok = new Map<string, number>()

const summary = (src: Record<string, SrcState>) => {
  const v = Object.values(src)
  const bad = v.find((x) => x.status === "error")
  return v.some((x) => x.status === "ready") ? { status: "ready" as const, msg: "" }
    : v.some((x) => x.status === "loading") ? { status: "loading" as const, msg: v.find((x) => x.status === "loading")!.msg }
    : bad ? { status: "error" as const, msg: bad.msg } : { status: "idle" as const, msg: "" }
}

const enabled = () => useApp.getState().sources.filter((s) => s.enabled !== false)

function patch(id: string, p: Partial<SrcState>) {
  useCatalog.setState((st) => {
    const sources = { ...st.sources, [id]: { ...(st.sources[id] ?? { status: "idle", msg: "", count: 0 }), ...p } }
    return { sources, ...summary(sources) }
  })
}

/** Re-merge every loaded + enabled source in priority order. */
let mergedSig = ""
const sigOf = () => enabled().filter((s) => raw.has(s.id)).map((s) => s.id).join(",")
function remerge() {
  mergedSig = sigOf()
  const m = mergeSources(enabled().filter((s) => raw.has(s.id)).map((s) => ({ id: s.id, items: raw.get(s.id)! })))
  useCatalog.setState({ ...m, epg: mergeEpg() })
}
function mergeEpg() {
  const out = new Map<string, Prog[]>()
  for (const s of enabled()) for (const [k, v] of epgs.get(s.id) ?? []) {
    const o = out.get(k)
    // same epgId in several sources: union the programmes (earlier source wins on identical start), never drop the later guide
    if (!o) out.set(k, v)
    else { const st = new Set(o.map((p) => p.s)); out.set(k, [...o, ...v.filter((p) => !st.has(p.s))].sort((x, y) => x.s - y.s)) }
  }
  return out
}

async function loadOne(src: Source, proxy: string, force?: boolean) {
  const t = (tok.get(src.id) ?? 0) + 1
  tok.set(src.id, t)
  const live = () => tok.get(src.id) === t
  patch(src.id, { status: "loading", msg: "Loading" })
  try {
    let items: Item[] | undefined
    const cached = force ? undefined : await get<{ at: number; items: Item[] }>("cat:" + src.id)
    if (cached && Date.now() - cached.at < TTL) items = cached.items
    if (!items) {
      const step = (msg: string) => live() && patch(src.id, { msg })
      if (src.type === "xtream") items = await loadXtream(src, proxy, step)
      else if (src.type === "plex") items = await loadPlex(src, proxy, step)
      else if (src.type === "jellyfin") items = await loadJellyfin(src, proxy, step)
      else {
        step("Downloading playlist")
        items = parseM3U(await fetchText(px(src.url!, proxy)), src.id)
      }
      if (!items.length) throw new Error("No channels found in this source")
      void set("cat:" + src.id, { at: Date.now(), items })
    }
    if (!live()) return
    raw.set(src.id, items)
    if (src.type === "plex" || src.type === "jellyfin") seedProgress(items)
    patch(src.id, { status: "ready", msg: "", count: items.length })
    remerge()
    void loadEpg(src, proxy, force, live)
  } catch (e) {
    if (live()) patch(src.id, { status: "error", msg: explain(e) })
  }
}

export const useCatalog = create<C>(() => ({
  sources: {},
  status: "idle",
  msg: "",
  items: [],
  byId: new Map(),
  primaryOf: new Map(),
  byKind: { live: [], movie: [], series: [] },
  groups: empty,
  epg: new Map(),
  epgTick: 0,
  forget: (id) => { void del("cat:" + id); void del("epg:" + id) },
  load: (src, proxy, force) => loadOne(src, proxy, force),
  retry: (id) => {
    const s = useApp.getState().sources.find((x) => x.id === id)
    return s ? loadOne(s, useApp.getState().settings.proxy, true) : Promise.resolve()
  },
  async loadAll(all, proxy, force) {
    const on = all.filter((s) => s.enabled !== false)
    const keep = new Set(on.map((s) => s.id))
    for (const id of [...raw.keys(), ...epgs.keys(), ...Object.keys(useCatalog.getState().sources)]) {
      if (keep.has(id)) continue
      raw.delete(id); epgs.delete(id); tok.set(id, (tok.get(id) ?? 0) + 1) // bump: in-flight loads of a removed source are ignored
    }
    useCatalog.setState((st) => {
      const sources = Object.fromEntries(Object.entries(st.sources).filter(([id]) => keep.has(id)))
      return { sources, ...summary(sources) }
    })
    if (sigOf() !== mergedSig) remerge() // only when a source was removed/reordered/toggled
    await Promise.all(on.map((s) => {
      if (!force && raw.has(s.id)) { if (s.type === "plex" || s.type === "jellyfin") seedProgress(raw.get(s.id)!); return }
      if (!force && useCatalog.getState().sources[s.id]?.status === "loading") return
      return loadOne(s, proxy, force)
    }))
  },
}))

/** Plex/Jellyfin watch positions become local progress (once) so Continue watching shows them. */
function seedProgress(items: Item[]) {
  const a = useApp.getState()
  const have = (a.profileId && a.data[a.profileId]?.progress) || {}
  for (const i of items) if (i.resume && i.resume > 30 && i.dur && !have[i.id]) a.setProgress(i.id, i.resume, i.dur)
}

async function loadEpg(src: Source, proxy: string, force?: boolean, live: () => boolean = () => true) {
  if (src.type === "plex") return // no guide for Plex
  const jf = src.type === "jellyfin"
  const url = jf ? "" : src.epgUrl || (src.type === "xtream" ? xmltvUrl(src) : "")
  const want = new Set((raw.get(src.id) ?? []).filter((i) => i.kind === "live").map((i) => i.epgId).filter(Boolean) as string[])
  if (jf ? !want.size : !url) return // Jellyfin: guide only when the server has live channels
  const from = Date.now() - 3 * 3600_000
  const key = "epg:" + src.id
  try {
    let epg: Map<string, Prog[]> | undefined
    const c = force ? undefined : await get<{ at: number; list: [string, Prog[]][] }>(key)
    if (c && Date.now() - c.at < 6 * 3600_000) epg = new Map(c.list)
    if (!epg) {
      epg = jf ? await jellyfinEpg(src, proxy, [...want], from, from + 40 * 3600_000) : parseXmltv(await fetchText(px(url, proxy)), want, from, from + 40 * 3600_000)
      void set(key, { at: Date.now(), list: [...epg] })
    }
    if (live()) { epgs.set(src.id, epg); useCatalog.setState({ epg: mergeEpg(), epgTick: Date.now() }) }
  } catch {
    /* guide is optional: channels still work without it */
  }
}

export function nowNext(epg: Map<string, Prog[]>, id?: string, at = Date.now()) {
  const l = id ? epg.get(id) : undefined
  if (!l) return {}
  const i = l.findIndex((p) => p.e > at)
  return i < 0 ? {} : l[i].s <= at ? { now: l[i], next: l[i + 1] } : { next: l[i] }
}

export const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
