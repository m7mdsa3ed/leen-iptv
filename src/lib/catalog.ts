import { create } from "zustand"
import { del, get, set } from "idb-keyval"
import type { Item, Kind, Source } from "./types"
import { explain, fetchText, px } from "./net"
import { t } from "./i18n"
import { parseM3U } from "./parse"
import { loadXtream } from "./xtream"
import { ensureConnection, loadPlex } from "./plex"
import { ensureJellyfinConnection, loadJellyfin } from "./jellyfin"
import { useApp } from "./store"
import { applyMatches, mergeSources, type Merged } from "./merge-pure"
import { applyLogos, type LogoIndex } from "./logos-pure"
import { loadLogoIndex } from "./logos"

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
  /** load every enabled source in parallel (skips ones already loaded unless force); drops removed/disabled ones */
  loadAll: (sources: Source[], proxy: string, force?: boolean) => Promise<void>
  /** (re)load ONE source and merge it (used by Retry) */
  load: (s: Source, proxy: string, force?: boolean) => Promise<void>
  retry: (id: string) => Promise<void>
  forget: (id: string) => void
}

// module state: raw per-source items (never mutated), latest load token per source
const raw = new Map<string, Item[]>()
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
  const st = useApp.getState().settings
  useCatalog.setState(withLogos(applyMatches(m, st.metaMatch, st.metaPosters ? posters : undefined))) // manual metadata matches rename / re-poster their titles
}
// a match picked, reset or synced in: re-apply over the loaded catalog
useApp.subscribe((s, p) => { if ((s.settings.metaMatch !== p.settings.metaMatch || s.settings.logoMatch !== p.settings.logoMatch || s.settings.metaPosters !== p.settings.metaPosters) && raw.size) remerge() })

/** Settings > Metadata > Replace posters: metadata poster per title (match key -> url), kept on this device (IndexedDB), applied over the source's own poster. */
let posters: Record<string, string> = {}
const POSTERS = "leen-posters"
void get<Record<string, string>>(POSTERS).then((v) => { if (v) { posters = { ...v, ...posters }; if (raw.size) remerge() } }).catch(() => {})
export const hasPoster = (key: string) => key in posters
export function addPosters(add: Record<string, string>) {
  posters = { ...posters, ...add }
  void set(POSTERS, posters).catch(() => {})
  if (raw.size && useApp.getState().settings.metaPosters) remerge()
}
export const clearPosters = () => { posters = {}; void del(POSTERS).catch(() => {}); if (raw.size) remerge() }

/** Channel logos: manual logo matches, then the source's own, then the bundled index by name (loaded once, then re-merged). */
let logoIx: LogoIndex | null = null
export const logoState = () => ({ ix: logoIx, raw: (id: string) => raw.get(id) ?? [] }) // Diagnostics
function withLogos(m: Merged): Merged {
  if (!logoIx && m.byKind.live.length) void loadLogoIndex().then((x) => { if (x && !logoIx) { logoIx = x; remerge() } }) // also the backup for providers' dead logo links
  const live = applyLogos(m.byKind.live, logoIx, useApp.getState().settings.logoMatch)
  if (live === m.byKind.live) return m
  const byId = new Map(m.byId)
  for (const i of live) byId.set(i.id, i)
  return { ...m, byId, byKind: { ...m.byKind, live }, items: m.items.map((i) => (i.kind === "live" ? byId.get(i.id)! : i)) }
}
/** Plex / Jellyfin: pick the address that answers now (home Wi-Fi vs away); the winner is saved into `server`. */
const ensure = (s: Source, force = false): Promise<Source> =>
  s.type === "plex" ? ensureConnection(s, force) : s.type === "jellyfin" ? ensureJellyfinConnection(s, force) : Promise.resolve(s)

async function loadOne(s0: Source, proxy: string, force?: boolean) {
  const tk = (tok.get(s0.id) ?? 0) + 1
  tok.set(s0.id, tk)
  const live = () => tok.get(s0.id) === tk
  patch(s0.id, { status: "loading", msg: t("errors.source.loading") })
  const multi = s0.type === "plex" || s0.type === "jellyfin"
  try {
    let src = s0
    let items: Item[] | undefined
    const cached = force ? undefined : await get<{ at: number; items: Item[]; server?: string }>("cat:" + s0.id)
    let offline = false
    if (multi) try { src = await ensure(s0, force) } catch (e) { if (!cached) throw e; offline = true } // no address answers: still show the cached catalog
    // cached items carry image URLs of the address they were loaded from: a different active address means reload
    if (cached && (offline || (Date.now() - cached.at < TTL && (!multi || cached.server === src.server)))) items = cached.items
    if (!items) {
      const step = (msg: string) => live() && patch(s0.id, { msg })
      const run = (s: Source) => s.type === "xtream" ? loadXtream(s, proxy, step) : s.type === "plex" ? loadPlex(s, proxy, step) : loadJellyfin(s, proxy, step)
      if (src.type === "m3u") {
        step(t("errors.source.downloading"))
        items = parseM3U(await fetchText(px(src.url!, proxy)), src.id)
      } else if (multi) {
        try { items = await run(src) } catch { items = await run(await ensure(src, true)) } // one retry on the other address (the second error is the one shown)
      } else items = await run(src)
      if (!items.length) throw new Error(t("errors.source.noChannels"))
      void set("cat:" + src.id, { at: Date.now(), items, server: multi ? useApp.getState().sources.find((x) => x.id === src.id)?.server : undefined })
    }
    if (!live()) return
    raw.set(src.id, items)
    if (multi) seedProgress(items)
    patch(src.id, { status: "ready", msg: "", count: items.length })
    remerge()
  } catch (e) {
    if (live()) patch(s0.id, { status: "error", msg: explain(e) })
  }
}

/** Moving between networks (home Wi-Fi <-> mobile data / away): re-pick the address of every Plex/Jellyfin source (local first) and reload what moved or had failed. */
let netTimer: ReturnType<typeof setTimeout> | undefined
function onNetwork() {
  clearTimeout(netTimer)
  netTimer = setTimeout(async () => {
    if (navigator.onLine === false) return
    for (const s of enabled().filter((x) => x.type === "plex" || x.type === "jellyfin")) {
      try {
        const r = await ensure(s, true)
        if (r.server !== s.server || useCatalog.getState().sources[s.id]?.status === "error") void loadOne(r, useApp.getState().settings.proxy, true)
      } catch { /* nothing reachable yet: the next network event tries again */ }
    }
  }, 1500)
}
if (typeof window !== "undefined") {
  window.addEventListener("online", onNetwork)
  window.addEventListener("offline", onNetwork)
  ;(navigator as Navigator & { connection?: EventTarget }).connection?.addEventListener("change", onNetwork)
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
  forget: (id) => { void del("cat:" + id) },
  load: (src, proxy, force) => loadOne(src, proxy, force),
  retry: (id) => {
    const s = useApp.getState().sources.find((x) => x.id === id)
    return s ? loadOne(s, useApp.getState().settings.proxy, true) : Promise.resolve()
  },
  async loadAll(all, proxy, force) {
    const on = all.filter((s) => s.enabled !== false)
    const keep = new Set(on.map((s) => s.id))
    for (const id of [...raw.keys(), ...Object.keys(useCatalog.getState().sources)]) {
      if (keep.has(id)) continue
      raw.delete(id); tok.set(id, (tok.get(id) ?? 0) + 1) // bump: in-flight loads of a removed source are ignored
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


