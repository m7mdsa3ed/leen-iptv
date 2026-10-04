// Pure multi-source merge (no '@/' imports, no DOM) so `node scripts/sources.check.ts` can run it.
import type { Item, Kind, MetaMatch } from "./types.ts"
import { cleanTitle, matchKeyOf, norm, yearOf } from "./meta/title.ts"

export const srcOfId = (id: string) => id.split("|")[0]

/** Plain category comparison key (NOT cleanTitle: "|AR| Action" and "|EN| Action" must stay apart). */
export const groupKey = (g: string) => g.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()

/** The stored lock key matching a category (by groupKey, so display-name changes and legacy exact-name keys both match), if any. */
export const findLock = (locked: string[], kind: string, group: string) => {
  const gk = groupKey(group)
  return locked.find((k) => k === `${kind}|${group}` || (k.startsWith(kind + "|") && groupKey(k.slice(kind.length + 1)) === gk))
}

/** movie/series duplicate key: kind + normalised title + year; null when title or year is unknown (never merged) or live. */
export function dedupeKey(i: Item): string | null {
  if (i.kind === "live") return null
  const year = i.year?.match(/\d{4}/)?.[0] ?? cleanTitle(i.name).year
  const t = norm(i.name)
  return year && t ? `${i.kind}|${t}|${year}` : null
}

export type Merged = {
  items: Item[] // what the UI lists: live (all) + primary movies/series, in priority order
  byId: Map<string, Item> // EVERY item (primary + alts)
  primaryOf: Map<string, Item> // alt id -> its primary
  byKind: Record<Kind, Item[]>
  groups: Record<Kind, string[]>
}

const keyCache = new WeakMap<Item, string | null>() // raw cached items are never mutated, so the key is stable
const keyOf = (raw: Item) => { let k = keyCache.get(raw); if (k === undefined) keyCache.set(raw, (k = dedupeKey(raw))); return k }

/** parts must be in priority order (first = highest). */
export function mergeSources(parts: { id: string; items: Item[] }[]): Merged {
  const items: Item[] = []
  const byId = new Map<string, Item>()
  const primaryOf = new Map<string, Item>()
  const names: Record<Kind, Map<string, string>> = { live: new Map(), movie: new Map(), series: new Map() }
  const seen = new Map<string, number>() // dedupe key -> index in items
  for (const part of parts) {
    for (const raw of part.items) {
      const gk = groupKey(raw.group)
      const g = names[raw.kind].get(gk) ?? (names[raw.kind].set(gk, raw.group), raw.group)
      const it = g === raw.group ? raw : { ...raw, group: g, origGroup: raw.group }
      byId.set(it.id, it)
      const k = keyOf(raw)
      const at = k === null ? undefined : seen.get(k)
      const p = at === undefined ? undefined : items[at]
      if (p && srcOfId(p.id) !== part.id) {
        const np = p.alts ? p : { ...p, alts: [] as Item[] } // fresh copy: never mutate cached source items
        np.alts!.push(it)
        if (np !== p) { items[at!] = np; byId.set(np.id, np) }
        primaryOf.set(it.id, np)
        continue
      }
      if (k !== null && at === undefined) seen.set(k, items.length)
      items.push(it)
    }
  }
  const byKind: Record<Kind, Item[]> = { live: [], movie: [], series: [] }
  const g: Record<Kind, Set<string>> = { live: new Set(), movie: new Set(), series: new Set() }
  for (const i of items) { byKind[i.kind].push(i); g[i.kind].add(i.group) }
  return { items, byId, primaryOf, byKind, groups: { live: [...g.live], movie: [...g.movie], series: [...g.series] } }
}

/** Items as seen with a source filter: the item of that source (primary or alt), others dropped. */
export function onlySource(items: Item[], srcId: string): Item[] {
  const out: Item[] = []
  for (const i of items) {
    if (srcOfId(i.id) === srcId) out.push(i)
    else { const a = i.alts?.find((x) => srcOfId(x.id) === srcId); if (a) out.push(a) }
  }
  return out
}

const mkCache = new Map<string, string>() // kind + name -> match key: survives re-merges
const matchKeyCached = (kind: string, name: string) => {
  const c = kind + "\u0000" + name
  let k = mkCache.get(c)
  if (k === undefined) { if (mkCache.size > 200000) mkCache.clear(); mkCache.set(c, (k = matchKeyOf(kind, name))) }
  return k
}

/**
 * Manual metadata matches win over the source: a matched movie/series (and its alts) shows the matched title, poster, backdrop and year everywhere.
 * The source's own name is kept in `srcName` (match keys and metadata lookups use it). Returns `m` itself when nothing matches.
 * `posters` (match key -> url, saved by Replace posters) swap only the poster of titles without a manual match poster.
 */
export function applyMatches(m: Merged, matches: Record<string, MetaMatch> | undefined, posters?: Record<string, string>): Merged {
  const keys = Object.keys(matches ?? {})
  const np = posters ? Object.keys(posters).length : 0
  if (!keys.length && !np) return m
  // a key ends with the name's bracketed year: items with another year cannot match, so the costly key is built for few items (and cached by name)
  const years = new Set(keys.map((k) => k.slice(k.lastIndexOf(":") + 1)))
  let changed = false
  const fix = (i: Item): Item => {
    const name = i.srcName ?? i.name
    const key = i.kind === "live" || (!np && !years.has(yearOf(name) ?? "")) ? undefined : matchKeyCached(i.kind, name)
    const v = key && matches?.[key]
    const o = typeof v === "object" && v.title ? v : undefined
    const mp = key && !o?.poster ? posters?.[key] : undefined
    const alts = i.alts?.map(fix)
    const altsChanged = !!alts && alts.some((a, n) => a !== i.alts![n])
    if (!o && !mp && !altsChanged) return i
    changed = true
    const r = { ...i, ...(altsChanged ? { alts } : {}), ...(mp ? { logo: mp, mposter: true } : {}) }
    return o ? { ...r, srcName: i.srcName ?? i.name, name: o.title!, logo: o.poster || r.logo, backdrop: o.backdrop || i.backdrop, year: o.year || i.year } : r
  }
  const items = m.items.map(fix)
  if (!changed) return m
  const byId = new Map(m.byId)
  const primaryOf = new Map(m.primaryOf)
  const byKind: Record<Kind, Item[]> = { live: [], movie: [], series: [] }
  for (const i of items) {
    byId.set(i.id, i)
    byKind[i.kind].push(i)
    for (const a of i.alts ?? []) { byId.set(a.id, a); primaryOf.set(a.id, i) }
  }
  return { ...m, items, byId, primaryOf, byKind }
}
