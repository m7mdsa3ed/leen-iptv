import type { Item, MetaMatch } from "./types"
import { logoFor, logoKey, type LogoIndex } from "./logos-pure.ts"
import { cleanTitle, matchKeyOf, norm, yearOf } from "./meta/title.ts"

/** Settings > Fix matches. Pure: lists of what needs a manual fix, and export / import of the manual fixes (which sync as g/ and m/ entities). */

export type LogoFix = { item: Item; key: string; from: "none" | "db"; logo?: string; copies: number }
/** Live channels (the sources' own items) with no logo, or with one only guessed by name; one row per channel key, not per HD/backup copy. */
export function logoFixes(live: Item[], ix: LogoIndex | null, matches: Record<string, string> | undefined): LogoFix[] {
  const out = new Map<string, LogoFix>()
  for (const i of live) {
    const { logo, from } = logoFor(i, ix, matches)
    const key = logoKey(i.name)
    if ((from !== "none" && from !== "db") || !key) continue
    const o = out.get(key)
    if (o) o.copies++
    else out.set(key, { item: i, key, from, logo, copies: 1 })
  }
  return [...out.values()]
}

export type MetaFix = { item: Item; key: string; reason: "failed" | "noPoster" | "unchecked" }
/** Order metadata fixes by newest release year, leaving undated titles in their existing order. */
export function newestMetaFixes<T extends { item: Item }>(fixes: T[]): T[] {
  return fixes.map((fix, index) => ({ fix, index, year: Number(fix.item.year?.match(/(?:19|20)\d{2}/)?.[0] ?? yearOf(fix.item.srcName ?? fix.item.name)) || 0 }))
    .sort((a, b) => b.year - a.year || a.index - b.index)
    .map(({ fix }) => fix)
}

/** Movies/series without a manual match whose lookup found nothing (`failed` = the cache's `kind:title:year` keys), or that have no poster at all. With `looked` (every cached lookup's match key), a title that has a poster but was never looked up is `unchecked`. */
export function metaFixes(vod: Item[], failed: Set<string>, matches: Record<string, MetaMatch> | undefined, looked?: Set<string>): MetaFix[] {
  const out: MetaFix[] = []
  const seen = new Set<string>()
  for (const i of vod) {
    const key = matchKeyOf(i.kind, i.srcName ?? i.name)
    if (seen.has(key) || matches?.[key]) continue
    seen.add(key)
    if (failed.has(key)) out.push({ item: i, key, reason: "failed" })
    else if (!i.logo) out.push({ item: i, key, reason: "noPoster" })
    else if (looked && !looked.has(key)) out.push({ item: i, key, reason: "unchecked" })
  }
  return out
}

/** The one TMDB candidate that is clearly this title: same cleaned title (or original title) and, when the name has a year, the same year. None or several -> undefined, left for the user. */
export function autoPick<C extends { title: string; alt?: string; year?: string }>(name: string, cands: C[]): C | undefined {
  const ct = cleanTitle(name), n = norm(ct.title)
  const hit = cands.filter((c) => (norm(c.title) === n || (!!c.alt && norm(c.alt) === n)) && (!ct.year || c.year === ct.year))
  return hit.length === 1 ? hit[0] : undefined
}

/** `meta5:<kind>:<title>:<year>:...` cache key of an empty lookup -> its `<kind>:<title>:<year>` match key. */
export const failedKey = (cacheKey: string) => { const p = cacheKey.split(":"); return p.length > 4 && p[0].startsWith("meta") ? p.slice(1, 4).join(":") : undefined }

export type Fixes = { logoMatch: Record<string, string>; metaMatch: Record<string, MetaMatch> }
export const exportFixes = (f: Partial<Fixes>) => JSON.stringify({ app: "leen", type: "matches", v: 1, exportedAt: new Date().toISOString(), logoMatch: f.logoMatch ?? {}, metaMatch: f.metaMatch ?? {} }, null, 2)

const str = (v: unknown, max = 2000): v is string => typeof v === "string" && v.length > 0 && v.length <= max
const url = (v: unknown): v is string => str(v) && /^(https?:)?\/\//i.test(v)
/** Parse an exported file. Anything that is not a well-formed entry is dropped (it is user-supplied data that will sync to every device); null = not a Leen matches file. */
export function parseFixes(text: string): Fixes | null {
  let j: unknown
  try { j = JSON.parse(text) } catch { return null }
  if (!j || typeof j !== "object" || (j as { type?: unknown }).type !== "matches") return null
  const { logoMatch: lm, metaMatch: mm } = j as { logoMatch?: unknown; metaMatch?: unknown }
  const out: Fixes = { logoMatch: {}, metaMatch: {} }
  if (lm && typeof lm === "object") for (const [k, v] of Object.entries(lm)) if (str(k, 300) && url(v)) out.logoMatch[k] = v
  if (mm && typeof mm === "object") for (const [k, v] of Object.entries(mm)) {
    if (!str(k, 300) || !/^(movie|series):/.test(k)) continue
    if (str(v, 20) && /^\d+$/.test(v)) out.metaMatch[k] = v // older id-only entries
    else if (v && typeof v === "object" && str((v as { id?: unknown }).id, 20) && /^\d+$/.test((v as { id: string }).id)) {
      const o = v as Record<string, unknown>
      out.metaMatch[k] = { id: o.id as string, ...(str(o.title, 300) ? { title: o.title } : {}), ...(str(o.year, 4) ? { year: o.year } : {}), ...(url(o.poster) ? { poster: o.poster } : {}), ...(url(o.backdrop) ? { backdrop: o.backdrop } : {}) }
    }
  }
  return out
}

/** Imported entries win over the current ones with the same key; the rest are kept. */
export const mergeFixes = (cur: Partial<Fixes>, add: Fixes): Fixes => ({ logoMatch: { ...cur.logoMatch, ...add.logoMatch }, metaMatch: { ...cur.metaMatch, ...add.metaMatch } })
