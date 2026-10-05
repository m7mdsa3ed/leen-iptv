// Pure multi-source merge (no '@/' imports, no DOM) so `node scripts/sources.check.ts` can run it.
import type { Item, Kind, MetaMatch } from "./types.ts"
import { cleanTitle, matchKeyOf, norm, yearOf } from "./meta/title.ts"
import { chanKey } from "./logos-pure.ts"

export const srcOfId = (id: string) => id.split("|")[0]

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

const yearOfItem = (i: Item) => i.year?.match(/\d{4}/)?.[0] ?? cleanTitle(i.name).year
const yearsOf = (i: Item) => new Set([i, ...(i.alts ?? [])].map(yearOfItem).filter((y): y is string => !!y))

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

/** parts must be in priority order (first = highest). */
export function mergeSources(parts: { id: string; items: Item[] }[], opts: GroupOpts = {}): Merged {
  const media = opts.media !== false
  const items: Item[] = []
  const byId = new Map<string, Item>()
  const primaryOf = new Map<string, Item>()
  const names: Record<Kind, Map<string, string>> = { live: new Map(), movie: new Map(), series: new Map() }
  const seen = new Map<string, number[]>() // title key -> possible primary indexes
  for (const part of parts) {
    for (const raw of part.items) {
      const gk = groupKey(raw.group)
      const g = names[raw.kind].get(gk) ?? (names[raw.kind].set(gk, raw.group), raw.group)
      const it = g === raw.group ? raw : { ...raw, group: g, origGroup: raw.group }
      byId.set(it.id, it)
      const k = raw.kind === "live" ? (opts.live ? liveKey(raw) : null) : media ? keyOf(raw) : null
      const candidates = k === null ? undefined : seen.get(k)
      const at = candidates?.find((index) => {
        const primary = items[index]
        if (it.kind === "live") return true // variants live side by side in one source
        if (srcOfId(primary.id) === part.id) return false
        const known = yearsOf(primary)
        const year = yearOfItem(it)
        return !year || !known.size || known.has(year)
      })
      const p = at === undefined ? undefined : items[at]
      if (p) {
        const np = p.alts ? p : { ...p, alts: [] as Item[] } // fresh copy: never mutate cached source items
        np.alts!.push(it)
        if (np !== p) { items[at!] = np; byId.set(np.id, np) }
        primaryOf.set(it.id, np)
        continue
      }
      if (k !== null) {
        if (candidates) candidates.push(items.length)
        else seen.set(k, [items.length])
      }
      items.push(it)
    }
  }
  const byKind: Record<Kind, Item[]> = { live: [], movie: [], series: [] }
  const g: Record<Kind, Set<string>> = { live: new Set(), movie: new Set(), series: new Set() }
  for (const i of items) { byKind[i.kind].push(i); g[i.kind].add(i.group) }
  return { items, byId, primaryOf, byKind, groups: { live: [...g.live], movie: [...g.movie], series: [...g.series] } }
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
