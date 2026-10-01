// Pure multi-source merge (no '@/' imports, no DOM) so `node scripts/sources.check.ts` can run it.
import type { Item, Kind } from "./types.ts"
import { cleanTitle, norm } from "./meta/title.ts"

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
