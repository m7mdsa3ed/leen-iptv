// Pure "do we have it?" matcher: a metadata title (trending / upcoming / new) -> the catalog item that plays it. No '@/' imports so `node scripts/avail.check.ts` can run it.
import type { Item, MetaMatch } from "../types.ts"
import { matchId, matchKeyOf, norm, tmdbId, yearOf } from "./title.ts"

/** A title from a metadata list. `kind` is series for TMDB tv. */
export type Ref = { kind: "movie" | "series"; tmdb?: string; imdb?: string; title: string; alt?: string; year?: string }

type Entry = { primary: Item; tmdb?: string; imdb?: string; year?: string }
export type Index = { tmdb: Map<string, Item>; imdb: Map<string, Item>; titles: Map<string, Entry[]> }

const imdbId = (v: unknown) => (/^tt\d{6,}$/.test(String(v ?? "").trim()) ? String(v).trim() : undefined)

/** Index primaries and their alts (every copy points at the primary). Ids come from the item, else from a manual match (`settings.metaMatch`); ids are keyed by kind because TMDB movie and tv ids overlap. */
export function buildIndex(items: Item[], matches: Record<string, MetaMatch> = {}): Index {
  const ix: Index = { tmdb: new Map(), imdb: new Map(), titles: new Map() }
  for (const p of items) for (const i of [p, ...(p.alts ?? [])]) {
    if (i.kind === "live") continue
    const src = i.srcName ?? i.name
    const tmdb = tmdbId(i.tmdb) ?? tmdbId(matchId(matches[matchKeyOf(i.kind, src)]))
    const imdb = imdbId(i.imdb)
    const year = i.year?.match(/\d{4}/)?.[0] ?? yearOf(src)
    if (tmdb && !ix.tmdb.has(`${i.kind}:${tmdb}`)) ix.tmdb.set(`${i.kind}:${tmdb}`, p) // first = highest priority wins
    if (imdb && !ix.imdb.has(`${i.kind}:${imdb}`)) ix.imdb.set(`${i.kind}:${imdb}`, p)
    // both names: applyMatches may have renamed the item to the TMDB title, the source keeps its own
    for (const n of new Set([norm(src), norm(i.name)])) {
      if (!n) continue
      const k = `${i.kind}|${n}`
      ix.titles.set(k, [...(ix.titles.get(k) ?? []), { primary: p, tmdb, imdb, year }])
    }
  }
  return ix
}

/** The catalog primary for a metadata title, or undefined = not available. Order: TMDB id, IMDb id, then normalised title (+ alt title) with the year as a guard: same year, then +-1, then a yearless copy; a farther year is a different film. A copy whose known id differs from the ref's is never matched by title. */
export function findMatch(ix: Index, r: Ref): Item | undefined {
  const tmdb = tmdbId(r.tmdb), imdb = imdbId(r.imdb)
  const hit = (tmdb && ix.tmdb.get(`${r.kind}:${tmdb}`)) || (imdb && ix.imdb.get(`${r.kind}:${imdb}`))
  if (hit) return hit
  const ry = Number(r.year?.match(/\d{4}/)?.[0])
  const seen = new Set<Entry>()
  let best: Entry | undefined, bestRank = 9
  for (const t of [r.title, r.alt]) {
    const n = t ? norm(t) : ""
    if (n) for (const e of ix.titles.get(`${r.kind}|${n}`) ?? []) {
      if (seen.has(e)) continue
      seen.add(e)
      if ((tmdb && e.tmdb && e.tmdb !== tmdb) || (imdb && e.imdb && e.imdb !== imdb)) continue
      const known = ry && e.year
      const d = known ? Math.abs(Number(e.year) - ry) : 2 // 2 = a year is unknown on one side
      if (known && d > 1) continue
      if (d < bestRank) { best = e; bestRank = d }
    }
  }
  return best?.primary
}
