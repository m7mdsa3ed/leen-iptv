import type { Item } from "./types"
import { fold, type Lang } from "./i18n/pure.ts"
import { yearOf } from "./meta/title.ts"

/** Browse side index + the extra filters of the filter panel. Pure (node scripts/browse.check.ts). */

/** The standard alphabet of each app language: the side index always shows all of it, then "#" (digits, symbols, other scripts). */
export const ALPHABET: Record<Lang, string[]> = { en: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"], ar: [..."ابتثجحخدذرزسشصضطظعغفقكلمنهوي"] }

/** Base letter of a title: accents dropped (É -> E) and Arabic alef/hamza forms folded (أ إ آ -> ا), the way the A-Z collator already orders them. */
export const letterOf = (name: string, lang: Lang) => {
  const c = (fold(name.trim().slice(0, 2)).replace(/[\u0300-\u036f]/g, "")[0] ?? "").toUpperCase()
  return ALPHABET[lang].includes(c) ? c : "#"
}

/** Side index over a list already in A-Z order: every letter of the alphabet + "#", `has` = some title starts with it; an empty letter jumps to the next letter that has titles. [] when fewer than 2 letters have titles. */
export function alphaIndex(names: string[], lang: Lang) {
  const first = new Map<string, number>()
  names.forEach((n, i) => { const ch = letterOf(n, lang); if (!first.has(ch)) first.set(ch, i) })
  if (first.size < 2) return []
  let next = Math.max(0, names.length - 1)
  const out = ALPHABET[lang].slice().reverse().map((ch) => { const i = first.get(ch); if (i != null) next = i; return { ch, index: next, has: i != null } }).reverse()
  return [...out, { ch: "#", index: first.get("#") ?? 0, has: first.has("#") }]
}

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
/** Most recently added to the source first; titles with no date last. */
export const byAdded = (a: Item, b: Item) => (b.added ?? 0) - (a.added ?? 0)
/** Newest release first: by release date, else year; titles with neither last. */
export const byRelease = (a: Item, b: Item) => { const x = relKey(a), y = relKey(b); return x === y ? 0 : x < y ? 1 : -1 }
