import type { Item } from "./types"
import { yearOf } from "./meta/title.ts"
import { LOCALE, fold, type Lang } from "./i18n/pure.ts"

/** The extra filters of the browse filter panel. Pure (node scripts/browse.check.ts). */

export type Watch = "new" | "started" | "done"
/** Extra browse filters (unset = any): watch state, decade (1990 = 1990-1999) and minimum rating (out of 10). */
export type More = { watch?: Watch; decade?: number; rating?: number }
type Prog = Record<string, { pos: number; dur: number } | undefined>

// a loose year in a name ("Dune 2021", "EN - Dune - 2021 4K"): a standalone 1920..next-year token with a letter before it ("2001: A Space Odyssey" and "1917" are titles, "Blade Runner 2049" is in the future)
// ponytail: heuristic; a title ending in a past year ("Movie 1984") reads as that year
const LOOSE = /(?:^|[\s\-|:.,_])((?:19[2-9]|20\d)\d)(?=$|[\s\-|:.,_])/g
const MAXY = new Date().getFullYear() + 1
function looseYear(name: string) {
  let y = 0
  for (const m of name.matchAll(LOOSE)) { const n = +m[1]; if (n <= MAXY && /\p{L}/u.test(name.slice(0, m.index))) y = n }
  return y
}
const years = new WeakMap<Item, number>() // a sort compares each item ~log n times: parse once
/** "2023-05-12", "2023-05-12T00:00:00Z" -> "2023-05-12"; anything else -> undefined. Used by the loaders for Item.released. */
export const day = (v: unknown) => String(v ?? "").match(/^(?:19|20)\d{2}-\d{2}-\d{2}/)?.[0]

/** Release year: the source's own, else the bracketed one in the name ("Title (2023)"), else a loose one ("Title 2023"); 0 = unknown. */
export function yearNum(i: Item) {
  let y = years.get(i)
  if (y === undefined) years.set(i, (y = parseInt(i.year ?? "", 10) || parseInt(yearOf(i.name) ?? "", 10) || looseYear(i.name)))
  return y
}
const decadeOf = (i: Item) => { const y = yearNum(i); return y > 1900 ? Math.floor(y / 10) * 10 : 0 }
/** A series' progress entry is its last played episode, so a series is only ever "new" or "started". */
export const watchOf = (i: Item, p?: { pos: number; dur: number }): Watch =>
  !p || !(p.pos > 0) ? "new" : i.kind !== "series" && p.pos / p.dur > 0.95 ? "done" : "started"
export const moreCount = (f: More) => (f.watch ? 1 : 0) + (f.decade ? 1 : 0) + (f.rating ? 1 : 0)
export const matchMore = (i: Item, f: More, prog: Prog) =>
  (!f.watch || watchOf(i, prog[i.id]) === f.watch) && (!f.decade || decadeOf(i) === f.decade) && (!f.rating || parseFloat(i.rating ?? "") >= f.rating)
/** Decades that have titles, newest first. */
export const decadesOf = (items: Item[]) => [...new Set(items.map(decadeOf).filter(Boolean))].sort((a, b) => b - a)
export const RATINGS = [5, 6, 7, 8]
// sort key: the release date, else the year alone ("2023" sorts after every dated 2023 title), "" = unknown (last)
const relKey = (i: Item) => i.released ?? (yearNum(i) ? String(yearNum(i)) : "")
/** Most recently added to the source first (a merged title counts its newest copy); titles with no date last. */
const added = new WeakMap<Item, number>() // items are immutable once merged (a rebuild makes new objects), so per-object caches stay true
const addedOf = (i: Item) => {
  let n = added.get(i)
  if (n === undefined) added.set(i, (n = (i.alts ?? []).reduce((m, a) => Math.max(m, a.added ?? 0), i.added ?? 0)))
  return n
}
export const byAdded = (a: Item, b: Item) => addedOf(b) - addedOf(a)
/** Newest release first: by release date, else year; titles with neither last. */
export const byRelease = (a: Item, b: Item) => { const x = relKey(a), y = relKey(b); return x === y ? 0 : x < y ? 1 : -1 }
const folded = new WeakMap<Item, string>()
/** fold(i.name), computed once per item: title filters run it over the whole catalog on every keystroke. */
export function foldedName(i: Item) {
  let n = folded.get(i)
  if (n === undefined) folded.set(i, (n = fold(i.name)))
  return n
}
const names = new Map<Lang, (a: Item, b: Item) => number>()
/** A-Z title compare for the app language. One Collator per language: localeCompare with options builds a new one per call (~40x slower on big catalogs). */
export function byName(lang: Lang) {
  let f = names.get(lang)
  if (!f) { const c = new Intl.Collator(LOCALE[lang], { numeric: true, sensitivity: "base" }).compare; names.set(lang, (f = (a, b) => c(a.name, b.name))) }
  return f
}
export type Sort = "default" | "az" | "rating" | "year" | "added"
const byRating = (a: Item, b: Item) => (parseFloat(b.rating ?? "") || 0) - (parseFloat(a.rating ?? "") || 0)
/** The list in this order (a new array; "default" = the list itself). Stable, so filtering the result keeps the same order as sorting the filtered list. */
export const sortList = (l: Item[], sort: Sort, lang: Lang) =>
  sort === "az" ? [...l].sort(byName(lang)) : sort === "rating" ? [...l].sort(byRating) : sort === "year" ? [...l].sort(byRelease) : sort === "added" ? [...l].sort(byAdded) : l
