// Pure multi-source merge (no '@/' imports, no DOM) so `node scripts/sources.check.ts` can run it.
import type { Item, Kind, MetaMatch } from "./types.ts"
import { cleanTitle, matchKeyOf, norm, yearOf } from "./meta/title.ts"
import { chanKey } from "./logos-pure.ts"

export const srcOfId = (id: string) => { const n = id.indexOf("|"); return n < 0 ? id : id.slice(0, n) } // no split: called per item in merges and filters
/** Categories a title shows in: its own plus those of same-source copies merged into it. */
export const catsOf = (i: Item) => i.cats ?? [i.group]

/** Plain category comparison key (NOT cleanTitle: "|AR| Action" and "|EN| Action" must stay apart). */
export const groupKey = (g: string) => g.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()

/** The stored lock key matching a category (by groupKey, so display-name changes and legacy exact-name keys both match), if any. */
export const findLock = (locked: string[], kind: string, group: string) => {
  const gk = groupKey(group)
  return locked.find((k) => k === `${kind}|${group}` || (k.startsWith(kind + "|") && groupKey(k.slice(kind.length + 1)) === gk))
}

/** Movie/series title key; year compatibility is checked separately so a missing year can still match. */
export function dedupeKey(i: Item): string | null {
  if (i.kind === "live") return null
  const t = norm(i.name)
  return t ? `${i.kind}|${t}` : null
}

/** Live variant key: cleaned channel name (HD/FHD/4K/backup and number prefixes dropped) + country hint, so "UK| BBC One HD" and "BBC One FHD (Backup)" stay apart but "UK: BBC One FHD" joins the first. */
export function liveKey(i: Item): string | null {
  const k = chanKey(i.name)
  return k.key ? `live|${k.hint ?? ""}|${k.key}` : null
}

// what tells copies of one title apart, read from the source's own name (and Plex's codecs); first match per group wins
const TAGS: [RegExp, string][][] = [
  [[/\b(?:4k|uhd|2160p)\b/i, "4K"], [/\b(?:fhd|1080p)\b/i, "1080p"], [/\b720p\b/i, "720p"], [/\bhd\b/i, "HD"], [/\b(?:sd|480p|576p)\b/i, "SD"]],
  [[/\b(?:dolby[ .-]?vision|dovi)\b/i, "Dolby Vision"], [/\bhdr(?:10\+?)?\b/i, "HDR"]],
  [[/\b(?:hevc|[hx]\.?265)\b/i, "HEVC"], [/\bav1\b/i, "AV1"]],
  [[/\b(?:dubbed|dub)\b/i, "Dubbed"], [/\b(?:subbed|subs?)\b/i, "Subbed"], [/\bmulti\b/i, "Multi"]],
  [[/\b(?:hdcam|cam(?:rip)?|telesync)\b/i, "CAM"]],
]
/** Short tags for a copy: language prefix ("|AR| X", "EN - X" -> "AR"/"EN"), resolution, HDR, codec, dub/sub, CAM. */
export function versionTags(i: Item): string[] {
  const n = i.srcName ?? i.name
  const lang = n.match(/^\s*[|[(]?\s*([A-Za-z]{2,3})\s*[|\])\-:]/)?.[1]
  const s = `${n} ${(i.codecs ?? "").split(",")[0]}`
  const out = lang ? [lang.toUpperCase()] : []
  for (const group of TAGS) { const hit = group.find(([re]) => re.test(s)); if (hit) out.push(hit[1]) }
  return out
}

const yearCache = new WeakMap<Item, string | undefined>() // raw items are never mutated: cleanTitle once per item per session
const yearOfItem = (i: Item) => {
  if (yearCache.has(i)) return yearCache.get(i)
  const y = i.year?.match(/\d{4}/)?.[0] ?? cleanTitle(i.name).year
  yearCache.set(i, y)
  return y
}
const groupCache = new Map<string, string>() // a catalog has a few hundred categories, not one per item
const groupKeyCached = (g: string) => { let k = groupCache.get(g); if (k === undefined) { if (groupCache.size > 20000) groupCache.clear(); groupCache.set(g, (k = groupKey(g))) } return k }

export type Merged = {
  items: Item[] // what the UI lists: primary channels / movies / series, in priority order (nothing grouped: every item)
  byId: Map<string, Item> // EVERY item (primary + alts)
  primaryOf: Map<string, Item> // alt id -> its primary
  byKind: Record<Kind, Item[]>
  groups: Record<Kind, string[]>
}

const keyCache = new WeakMap<Item, string | null>() // raw cached items are never mutated, so the key is stable
const keyOf = (raw: Item) => { let k = keyCache.get(raw); if (k === undefined) keyCache.set(raw, (k = dedupeKey(raw))); return k }

/** What collapses into one primary with `alts`: media = the same movie/series across sources (default on), live = channel variants (HD/FHD/4K/backup, any source, default off). */
export type GroupOpts = { media?: boolean; live?: boolean }

export type MergePart = { id: string; items: Item[]; self?: boolean }

const insertSorted = (list: number[], n: number) => {
  let i = list.length
  while (i > 0 && list[i - 1] > n) i--
  list.splice(i, 0, n)
}

/**
 * The one merge loop behind mergeSources and mergeSourcesAsync: yields after every `every` items (0 = never).
 * A copy joins the FIRST primary (index order) with its key that it may join: live variants any; a movie/series not a same-source primary of a
 * non-self part, and a year compatible with the primary's years (no year on either side, or one shared). Candidates come from sorted per-key
 * index lists instead of a scan over every same-key primary.
 */
function* mergeCore(parts: MergePart[], opts: GroupOpts, every: number): Generator<void, Merged, unknown> {
  const media = opts.media !== false
  const items: Item[] = []
  const src: string[] = [] // source id of items[n]
  const py: (string | undefined)[] = [] // year of the primary itself, at creation
  const yrs: (Set<string> | undefined)[] = [] // the years of a primary and its copies, made when a copy brings a year
  const byId = new Map<string, Item>()
  const primaryOf = new Map<string, Item>()
  const names: Record<Kind, Map<string, string>> = { live: new Map(), movie: new Map(), series: new Map() }
  const seen = new Map<string, number[]>() // key -> every primary with it, index order
  const byYear = new Map<string, number[]>() // key \0 year -> primaries whose years include it, index order
  const noYear = new Map<string, number[]>() // key -> primaries with no year yet, index order
  let count = 0
  for (const part of parts) {
    const start = items.length, self = !!part.self, pid = part.id
    // first primary of a sorted list this part may join: in a non-self part the primaries made since `start` are its own, and they are all at the tail
    const pick = (list: number[] | undefined): number | undefined => {
      if (list) for (const n of list) { if (self || src[n] !== pid) return n; if (n >= start) return undefined }
      return undefined
    }
    for (const raw of part.items) {
      if (every && ++count % every === 0) yield
      const gk = groupKeyCached(raw.group)
      const g = names[raw.kind].get(gk) ?? (names[raw.kind].set(gk, raw.group), raw.group)
      const it = g === raw.group ? raw : { ...raw, group: g, origGroup: raw.group }
      byId.set(it.id, it)
      const live = raw.kind === "live"
      const k = live ? (opts.live ? liveKey(raw) : null) : media ? keyOf(raw) : null
      if (k === null) { items.push(it); src.push(pid); py.push(undefined); continue }
      const year = live ? undefined : yearOfItem(raw)
      const all = seen.get(k)
      let at: number | undefined
      if (all) {
        if (live) at = all[0] // variants live side by side in one source
        else if (!year) at = pick(all)
        else {
          const a = pick(byYear.get(k + "\0" + year)), b = pick(noYear.get(k))
          at = a === undefined ? b : b === undefined ? a : Math.min(a, b)
        }
      }
      if (at !== undefined) {
        const p = items[at]
        const np = p.alts ? p : { ...p, alts: [] as Item[] } // fresh copy: never mutate cached source items
        np.alts!.push(it)
        if (!live && year) {
          const s = (yrs[at] ??= new Set(py[at] ? [py[at]!] : []))
          if (!s.has(year)) {
            if (!s.size) { const l = noYear.get(k)!; l.splice(l.indexOf(at), 1) }
            s.add(year)
            const yk = k + "\0" + year, l = byYear.get(yk)
            if (l) insertSorted(l, at)
            else byYear.set(yk, [at])
          }
        }
        if (!live && src[at] === pid && !catsOf(np).includes(it.group)) np.cats = [...catsOf(np), it.group]
        if (np !== p) { items[at] = np; byId.set(np.id, np) }
        primaryOf.set(it.id, np)
        continue
      }
      const n = items.length
      if (all) all.push(n)
      else seen.set(k, [n])
      if (!live) {
        const yk = year ? k + "\0" + year : k, map = year ? byYear : noYear, l = map.get(yk)
        if (l) l.push(n)
        else map.set(yk, [n])
      }
      items.push(it); src.push(pid); py.push(year || undefined)
    }
  }
  const byKind: Record<Kind, Item[]> = { live: [], movie: [], series: [] }
  const g: Record<Kind, Set<string>> = { live: new Set(), movie: new Set(), series: new Set() }
  for (const i of items) { byKind[i.kind].push(i); for (const c of catsOf(i)) g[i.kind].add(c) }
  return { items, byId, primaryOf, byKind, groups: { live: [...g.live], movie: [...g.movie], series: [...g.series] } }
}

/** parts must be in priority order (first = highest). `self` = also merge copies inside that source (IPTV lists one title under several categories). */
export function mergeSources(parts: MergePart[], opts: GroupOpts = {}): Merged {
  const run = mergeCore(parts, opts, 0)
  let r = run.next()
  while (!r.done) r = run.next()
  return r.value
}

/** mergeSources in slices: gives the main thread back every `yieldEvery` items (setTimeout, Chrome 94 has no scheduler.yield).
    Rejects with an Error named "AbortError" once `abort.aborted` is true (checked at each slice). Same result as mergeSources. */
export async function mergeSourcesAsync(parts: MergePart[], opts: GroupOpts = {}, yieldEvery = 4000, abort?: { readonly aborted: boolean }): Promise<Merged> {
  const run = mergeCore(parts, opts, Math.max(1, yieldEvery))
  for (let r = run.next(); ; r = run.next()) {
    if (r.done) return r.value
    await new Promise((res) => setTimeout(res, 0))
    if (abort?.aborted) { const e = new Error("merge aborted"); e.name = "AbortError"; throw e }
  }
}

/** Items as seen with a source filter: with sources picked, a deduped title shows as the picked source's own copy (primary or alt); no ids = everything. */
export function onlySource(items: Item[], srcIds: string[]): Item[] {
  if (!srcIds.length) return items
  const want = new Set(srcIds)
  const out: Item[] = []
  for (const i of items) {
    if (want.has(srcOfId(i.id))) out.push(i)
    else { const a = i.alts?.find((x) => want.has(srcOfId(x.id))); if (a) out.push(a) }
  }
  return out
}

const mkCache = new Map<string, string>() // kind + name -> match key: survives re-merges
export const matchKeyCached = (kind: string, name: string) => {
  const c = kind + "\u0000" + name
  let k = mkCache.get(c)
  if (k === undefined) { if (mkCache.size > 200000) mkCache.clear(); mkCache.set(c, (k = matchKeyOf(kind, name))) }
  return k
}

/**
 * Manual metadata matches win over the source: a matched movie/series (and its alts) shows the matched title, poster, backdrop and year everywhere.
 * The source's own name is kept in `srcName` (match keys and metadata lookups use it). Returns `m` itself when nothing matches.
 * `found` (match key -> what the metadata lookup found, saved by the background queue / Replace posters) fills the same fields for titles without a manual match;
 * a manual match only takes its poster from it when it has none. A bare string = a poster (older saved data).
 */
export type Found = { title?: string; year?: string; poster?: string; backdrop?: string; genres?: string[]; plot?: string; rating?: string }
/** What a lookup result adds to the catalog (rating = the first numeric 0-10 one, like the panel's). */
export const foundOf = (m: { title?: string; year?: string; poster?: string; backdrop?: string; genres: string[]; plot?: string; ratings: { source: string; value: string }[] }): Found => {
  const f: Found = { title: m.title, year: m.year, poster: m.poster, backdrop: m.backdrop, genres: m.genres.length ? m.genres : undefined, plot: m.plot, rating: m.ratings.find((r) => (r.source === "TMDB" || r.source === "IMDb") && parseFloat(r.value) > 0)?.value }
  for (const k of Object.keys(f) as (keyof Found)[]) if (!f[k]) delete f[k]
  return f
}
/** Match key (of the source's own name) -> indexes in `m.items` of the movie/series primaries it touches (its own key or one of its alts'). Build it over the pristine merge. */
export function buildMatchIndex(m: Merged): Map<string, number[]> {
  const ix = new Map<string, number[]>()
  const add = (k: string, n: number) => { const l = ix.get(k); if (!l) ix.set(k, [n]); else if (l[l.length - 1] !== n) l.push(n) }
  m.items.forEach((i, n) => {
    if (i.kind === "live") return
    add(matchKeyCached(i.kind, i.srcName ?? i.name), n)
    for (const a of i.alts ?? []) add(matchKeyCached(a.kind, a.srcName ?? a.name), n)
  })
  return ix
}

/**
 * Re-apply options. `changed` + `index` (buildMatchIndex of the pristine merge) + `from` (the pristine merge's items): only the titles with those
 * match keys are fixed again, from `from[n]`, and the rest of `m` (the last result) is kept; byKind arrays without a changed item, and `m` itself
 * when nothing changed, are returned as they are. `owned`: `m` is the caller's private copy, so its items / byId / primaryOf are written in place.
 */
export type ApplyOpts = { changed?: Iterable<string>; owned?: boolean; index?: Map<string, number[]>; from?: Item[] }

function fixer(matches: Record<string, MetaMatch> | undefined, found: Record<string, Found | string> | undefined, all: boolean) {
  const keys = Object.keys(matches ?? {})
  const np = found ? Object.keys(found).length : 0
  // a key ends with the name's bracketed year: items with another year cannot match, so the costly key is built for few items (and cached by name)
  const years = new Set(keys.map((k) => k.slice(k.lastIndexOf(":") + 1)))
  const fix = (i: Item): Item => {
    const name = i.srcName ?? i.name
    const key = i.kind === "live" || (!all && !np && !years.has(yearOf(name) ?? "")) ? undefined : matchKeyCached(i.kind, name)
    const v = key && matches?.[key]
    const o = typeof v === "object" && v.title ? v : undefined
    const f0 = key ? found?.[key] : undefined
    const f = typeof f0 === "string" ? { poster: f0 } : f0
    const alts = i.alts?.map(fix)
    const altsChanged = !!alts && alts.some((a, n) => a !== i.alts![n])
    if (!o && !f && !altsChanged) return i
    const r = { ...i, ...(altsChanged ? { alts } : {}) }
    if (o) return { ...r, ...(!o.poster && f?.poster ? { mposter: true } : {}), srcName: i.srcName ?? i.name, name: o.title!, logo: o.poster || (f?.poster ?? r.logo), backdrop: o.backdrop || i.backdrop, year: o.year || i.year }
    if (!f) return r
    return { ...r, ...(f.poster ? { logo: f.poster, mposter: true } : {}), ...(f.title && f.title !== i.name ? { srcName: i.srcName ?? i.name, name: f.title } : {}), year: f.year || i.year, backdrop: f.backdrop || i.backdrop, plot: f.plot || i.plot, rating: f.rating || i.rating, genres: f.genres || i.genres }
  }
  return { fix, none: !keys.length && !np }
}

export function applyMatches(m: Merged, matches: Record<string, MetaMatch> | undefined, found?: Record<string, Found | string>, opts?: ApplyOpts): Merged {
  if (opts?.changed && opts.index) return applySome(m, matches, found, opts.changed, opts.index, opts.from ?? m.items, !!opts.owned)
  const { fix, none } = fixer(matches, found, false)
  if (none) return m
  let changed = false
  const items = opts?.owned ? m.items : new Array<Item>(m.items.length)
  m.items.forEach((i, n) => { const f = fix(i); if (f !== i) changed = true; items[n] = f })
  if (!changed) return m
  const byId = opts?.owned ? m.byId : new Map(m.byId)
  const primaryOf = opts?.owned ? m.primaryOf : new Map(m.primaryOf)
  const byKind: Record<Kind, Item[]> = { live: m.byKind.live, movie: [], series: [] } // live is never matched
  for (const i of items) {
    if (i.kind === "live") continue
    byId.set(i.id, i)
    byKind[i.kind].push(i)
    for (const a of i.alts ?? []) { byId.set(a.id, a); primaryOf.set(a.id, i) }
  }
  return { ...m, items, byId, primaryOf, byKind }
}

function applySome(m: Merged, matches: Record<string, MetaMatch> | undefined, found: Record<string, Found | string> | undefined, keys: Iterable<string>, index: Map<string, number[]>, from: Item[], owned: boolean): Merged {
  const { fix } = fixer(matches, found, true)
  const at = new Set<number>()
  for (const k of keys) for (const n of index.get(k) ?? []) at.add(n)
  let items = m.items, byId = m.byId, primaryOf = m.primaryOf
  const kinds = new Set<Kind>()
  for (const n of at) {
    const f = fix(from[n])
    if (f === items[n]) continue
    if (!kinds.size && !owned) { items = items.slice(); byId = new Map(byId); primaryOf = new Map(primaryOf) }
    kinds.add(f.kind)
    items[n] = f
    byId.set(f.id, f)
    for (const a of f.alts ?? []) { byId.set(a.id, a); primaryOf.set(a.id, f) }
  }
  if (!kinds.size) return m
  const byKind = { ...m.byKind }
  for (const k of kinds) byKind[k] = []
  for (const i of items) if (kinds.has(i.kind)) byKind[i.kind].push(i)
  return { ...m, items, byId, primaryOf, byKind }
}
