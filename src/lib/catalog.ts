import { create } from "zustand"
import { del, get, set } from "idb-keyval"
import type { Item, Kind, Source } from "./types"
import { explain, fetchText, px } from "./net"
import { t } from "./i18n"
import { parseM3U } from "./parse"
import { loadXtreamKind, xtreamAuth, type XtreamKind } from "./xtream"
import { ensureConnection, loadPlex, pingPlex, plexHistory } from "./plex"
import { ensureJellyfinConnection, jellyfinHistory, loadJellyfin, pingJellyfin } from "./jellyfin"
import { isTv } from "./device"
import { useApp } from "./store"
import { applyMatches, mergeSources, type Found, type Merged } from "./merge-pure"
import { applyLogos, type LogoIndex } from "./logos-pure"
import { loadLogoIndex } from "./logos"

const TTL = 12 * 3600_000
const CACHE_V = 4 // bump when loaders map new fields (2: Xtream year, 3: release dates, 4: added dates), so cached catalogs reload once
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
  /** load every enabled source (skips ones already loaded unless force); drops removed/disabled ones */
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
  const st = useApp.getState().settings
  const m = mergeSources(enabled().filter((s) => raw.has(s.id)).map((s) => ({ id: s.id, items: raw.get(s.id)!, self: s.type === "xtream" || s.type === "m3u" })), { media: st.groupMedia !== false, live: !!st.groupLive })
  useCatalog.setState(withLogos(applyMatches(m, st.metaMatch, st.metaPosters !== false ? posters : undefined))) // manual metadata matches rename / re-poster their titles
}

/** A staged load merges once per part: coalesce the passes, so a big catalog is not re-merged three times in a row. */
let mergeTimer: number | undefined
function scheduleMerge() {
  if (mergeTimer !== undefined) return
  mergeTimer = window.setTimeout(() => { mergeTimer = undefined; remerge() }, 50)
}
// a match picked, reset or synced in: re-apply over the loaded catalog
useApp.subscribe((s, p) => { if ((s.settings.metaMatch !== p.settings.metaMatch || s.settings.logoMatch !== p.settings.logoMatch || s.settings.metaPosters !== p.settings.metaPosters || s.settings.groupMedia !== p.settings.groupMedia || s.settings.groupLive !== p.settings.groupLive) && raw.size) remerge() })

/** What the metadata lookups found per title (match key -> poster, title, year, backdrop, genres, plot, rating), kept on this device (IndexedDB) and applied over the source's own data in every list and page.
    Settings > Metadata > Use metadata turns it off. Older saved data is a bare poster url per key. */
let posters: Record<string, Found | string> = {}
const POSTERS = "leen-posters"
void get<Record<string, Found | string>>(POSTERS).then((v) => { if (v) { posters = { ...v, ...posters }; if (raw.size) remerge() } }).catch(() => {})
export const hasPoster = (key: string) => typeof posters[key] === "object" // a bare poster url (older data) is looked up again for the rest
export function addPosters(add: Record<string, Found>) {
  posters = { ...posters, ...add }
  void set(POSTERS, posters).catch(() => {})
  if (raw.size && useApp.getState().settings.metaPosters !== false) remerge()
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
/** Does the active address answer right now? `ensure` does not probe a single address, and a cached catalog proves nothing. */
const ping = (s: Source) => (s.type === "plex" ? pingPlex(s) : pingJellyfin(s))

/**
 * A catalog is cached in PARTS, and each part is merged as it arrives: a TV shows its channels while the movies and the series are still downloading,
 * and a cached part is painted before the network is touched at all (a stale one is refreshed behind the screen).
 * Xtream has three parts (live / movie / series); M3U and Plex/Jellyfin load in one.
 */
type Part = XtreamKind | "all"
const PARTS: Record<Source["type"], readonly Part[]> = { xtream: ["live", "movie", "series"], m3u: ["all"], plex: ["all"], jellyfin: ["all"] }
type Cached = { at: number; v: number; items: Item[]; server?: string }
const partKey = (id: string, part: Part) => `cat:${id}:${part}`
async function readPart(id: string, part: Part): Promise<Cached | undefined> {
  try { return await get<Cached>(partKey(id, part)) } catch { return undefined } // private mode / no IndexedDB: just load it
}
const writePart = (id: string, part: Part, c: Cached) => { void set(partKey(id, part), c).catch(() => {}) }

/** Fetch one part of a source's catalog. */
async function fetchPart(src: Source, part: Part, proxy: string, step: (m: string) => void): Promise<Item[]> {
  if (src.type === "xtream") return loadXtreamKind(src, proxy, part as XtreamKind, step)
  if (src.type === "m3u") {
    step(t("errors.source.downloading"))
    return parseM3U(await fetchText(px(src.url!, proxy)), src.id)
  }
  const run = (s: Source) => s.type === "plex" ? loadPlex(s, proxy, step) : loadJellyfin(s, proxy, step)
  try { return await run(src) } catch { return await run(await ensure(src, true)) } // one retry on the other address (the second error is the one shown)
}

/** Refresh ONE cached part behind the screen (its stale copy is already showing); a failure leaves the cache alone. */
async function refreshPart(src: Source, part: Part, proxy: string, tk: number) {
  try {
    const items = await fetchPart(src, part, proxy, () => {})
    const cur = raw.get(src.id)
    if (!items.length || tok.get(src.id) !== tk || !cur) return
    writePart(src.id, part, { at: Date.now(), v: CACHE_V, items, server: src.type === "plex" || src.type === "jellyfin" ? src.server : undefined })
    raw.set(src.id, part === "all" ? items : [...cur.filter((i) => i.kind !== part), ...items])
    scheduleMerge()
  } catch { /* offline / provider down: what is on screen stays */ }
}

/**
 * A Plex / Jellyfin that cannot be reached is hidden (tiles, versions, filter chip) until it answers again; Settings > Sources still lists it with the error.
 * It comes back when `recheck` finds it (every minute, or on a network event), or on Refresh / app start.
 * ponytail: the timer only retries hidden servers; one that drops while connected is noticed on a network event or a load, add a probe of the connected ones if that is too slow.
 */
function unreachable(id: string, e: unknown) {
  const { sourceFilter, setSourceFilter } = useApp.getState()
  if (sourceFilter.includes(id)) setSourceFilter(sourceFilter.filter((x) => x !== id)) // a stale pick must not leave the grid empty
  patch(id, { status: "error", msg: explain(e) })
  if (raw.delete(id)) remerge()
}

// caches written by the one-piece format: replacing a few hundred KB key with the parts, once per session
const legacy = new Set<string>()

async function loadOne(s0: Source, proxy: string, force?: boolean) {
  const tk = (tok.get(s0.id) ?? 0) + 1
  tok.set(s0.id, tk)
  const live = () => tok.get(s0.id) === tk
  patch(s0.id, { status: "loading", msg: t("errors.source.loading") })
  const multi = s0.type === "plex" || s0.type === "jellyfin"
  const parts = PARTS[s0.type]
  const got: Item[] = []
  // what we have so far goes into the merged catalog straight away (status ready: the rest keeps arriving in the background)
  const push = (add: Item[]) => {
    if (!add.length) return
    got.push(...add)
    raw.set(s0.id, [...got])
    const st = useCatalog.getState()
    // the first data of the launch merges in the same tick as its status (no empty frame); the parts after it are coalesced
    if (!st.items.length && !st.byKind.live.length) remerge()
    else scheduleMerge()
    patch(s0.id, { status: "ready", msg: "", count: got.length })
  }
  try {
    let src = s0
    if (multi) src = await ensure(s0, force) // throws when no address answers
    if (!legacy.has(s0.id)) { legacy.add(s0.id); void del("cat:" + s0.id) } // drop the single-blob cache of older builds
    let authed = s0.type !== "xtream" // only asked for once, and only when a part really has to be fetched (cache-first launches stay offline)
    for (const part of parts) {
      // cached items carry image URLs of the address they were loaded from: a different active address means reload
      const cached = force ? undefined : await readPart(s0.id, part)
      if (cached && cached.v === CACHE_V && (!multi || cached.server === src.server)) {
        if (!live()) return
        if (multi) await ping(src)
        push(cached.items)
        if (Date.now() - cached.at >= TTL) void refreshPart(src, part, proxy, tk)
        continue
      }
      if (!authed) { authed = true; await xtreamAuth(src, proxy) } // a bad account fails before anything is fetched
      const items = await fetchPart(src, part, proxy, (m) => live() && patch(s0.id, { msg: m }))
      if (!live()) return
      writePart(s0.id, part, { at: Date.now(), v: CACHE_V, items, server: multi ? src.server : undefined })
      push(items)
    }
    if (!got.length) throw new Error(t("errors.source.noChannels"))
    if (multi) pullHistory(src, proxy)
  } catch (e) {
    if (!live()) return
    if (multi) return unreachable(s0.id, e)
    // a part may already be on screen (staged load): keep it and say why the rest is missing, Settings > Sources shows the reason
    patch(s0.id, { status: got.length ? "ready" : "error", msg: explain(e) })
  }
}

/** Run `run` over `items` with at most `limit` in flight (a TV loads one source at a time, not every one at once). */
async function pool<T>(items: readonly T[], limit: number, run: (x: T) => unknown) {
  let next = 0
  const worker = async () => { while (next < items.length) { const i = next++; await run(items[i]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
}

/**
 * Re-pick the address of every Plex/Jellyfin source (local first), reload what moved or had failed, hide what no longer answers.
 * `onlyDown` (the minute timer): just the hidden ones, and a miss changes nothing, so a retry never makes a chip blink or hides a connected server.
 */
async function recheck(onlyDown = false) {
  if (navigator.onLine === false) return
  for (const s of enabled().filter((x) => x.type === "plex" || x.type === "jellyfin")) {
    const down = () => useCatalog.getState().sources[s.id]?.status === "error"
    if (onlyDown && !down()) continue
    try {
      const r = await ensure(s, true)
      await ping(r)
      if (r.server !== s.server || down()) void loadOne(r, useApp.getState().settings.proxy, true)
    } catch (e) { if (!onlyDown) unreachable(s.id, e) }
  }
}

/** Moving between networks (home Wi-Fi <-> mobile data / away). */
let netTimer: ReturnType<typeof setTimeout> | undefined
function onNetwork() {
  clearTimeout(netTimer)
  netTimer = setTimeout(() => void recheck(), 1500)
}
if (typeof window !== "undefined") {
  window.addEventListener("online", onNetwork)
  window.addEventListener("offline", onNetwork)
  ;(navigator as Navigator & { connection?: EventTarget }).connection?.addEventListener("change", onNetwork)
  setInterval(() => void recheck(true), 60_000) // ponytail: runs can overlap when probes outlast a minute; harmless (a reload in flight is not "down"), add a flag if it shows up
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
  forget: (id) => { for (const p of ["live", "movie", "series", "all"] as Part[]) void del(partKey(id, p)); void del("cat:" + id) },
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
    await pool(on, isTv ? 1 : 2, (s) => {
      if (!force && raw.has(s.id)) { if (s.type === "plex" || s.type === "jellyfin") pullHistory(s, proxy); return }
      if (!force && useCatalog.getState().sources[s.id]?.status === "loading") return
      return loadOne(s, proxy, force)
    })
  },
}))

/** Plex/Jellyfin watch history (watched + in progress, with the server's last-watched time) into the current profile; at most every 5 minutes per source and profile. */
const pulled = new Map<string, number>()
function pullHistory(s: Source, proxy: string) {
  const pid = useApp.getState().profileId, key = `${s.id}:${pid}`
  if (Date.now() - (pulled.get(key) ?? 0) < 5 * 60_000) return
  pulled.set(key, Date.now())
  ;(s.type === "plex" ? plexHistory : jellyfinHistory)(s, proxy).then(
    (w) => { if (useApp.getState().profileId === pid) useApp.getState().pullProgress(w) },
    () => pulled.delete(key), // unreachable now: try again on the next load
  )
}
