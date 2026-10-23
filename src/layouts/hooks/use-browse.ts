import { useCallback, useDeferredValue, useMemo, useState } from "react"
import { ALL, CONT, FAV, useContinue } from "@/components/tv/groups"
import { askPin, useOpen } from "@/components/tv/ui"
import { fold, useLang, useT } from "@/lib/i18n"
import { foldedName, matchMore, moreCount, sortList } from "@/lib/browse-pure"
import { useGenres } from "@/lib/meta"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { catsOf, findLock } from "@/lib/merge-pure"
import { useApp, usePData, useProfile } from "@/lib/store"
import type { Item, Kind } from "@/lib/types"
import { pctOf, sortsFor, useStable, type Sort } from "./use-category"
import { useActiveFilter, useCatalogView, inSource } from "./use-source-filter"

const MAX_RAILS = 30
const RAIL_ITEMS = 20
const NO_LOCKS: string[] = []
const NO_ITEMS: Item[] = []
export { ALL, CONT, FAV }

/**
 * Movies / Series browse data.
 * Returns {
 *  status ("idle"|"loading"|"ready"|"error"), groups (category names), genres (TMDB genre names for the kind),
 *  g / setG (selected pseudo group: ALL | FAV; real categories open their own page via openCategory), items (FAV list; [] for ALL),
 *  list (the grid: every title of the group, title-filtered by q and ordered by sort; ALL unfiltered keeps its rail sample),
 *  alpha ([{ ch, index, has }] side index: the whole alphabet of the app language + "#", index = first title of that letter in A-Z order (an empty letter: the next one), has = some title starts with it),
 *  cats / toggleCat / clearCats (categories picked for this kind, [] = All; shown in the filter panel), refined (a picked category, query or order is narrowing the list, so the flat grid replaces the rails), activeCount (picked sources + categories + extra filters (watch state / decade / rating, store `moreFilter`), for the Filters button),
 *  q / setQ (title filter), sort / setSort + sorts ([Sort,label][] available), rails: [categoryName, Item[<=20]][] (<=30, only when g === ALL), rails, favorites (this kind's favorite Items),
 *  pct(item) progress %|undefined, isFav(item), isLocked(cat), canLock (profile has a PIN), toggleLock(cat) (PIN-aware, ignores ALL/FAV),
 *  open(item) (PIN-aware), openCategory(cat), openGenre(name), kindLabel (localised "Movies"|"Series"), page ("movies"|"series")
 * }
 */
export function useBrowse(kind: Exclude<Kind, "live">) {
  const t = useT()
  const status = useCatalog((s) => s.status)
  const byId = useCatalog((s) => s.byId)
  const { byKind, groups } = useCatalogView()
  const filter = useActiveFilter()
  const { favs, progress } = usePData()
  const p = useProfile()
  const toggleLockStore = useApp((s) => s.toggleLock)
  const open = useOpen()
  const go = useRoute((s) => s.go)
  const genres = useGenres(kind)
  const [g, setG] = useState(ALL)
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<Sort>("added")
  const { lang } = useLang()
  const locked = p?.locked ?? NO_LOCKS
  const lockKey = (c: string) => findLock(locked, kind, c)
  const favorites = useMemo(() => favs.map((id) => byId.get(id)).filter((i): i is Item => !!i && i.kind === kind && inSource(i, filter)), [byId, kind, favs, filter]) // via byId: favorites of deduped (alt) items still show
  const cont = useContinue(kind)
  const inGroup = useMemo(() => (g === CONT || g === FAV || g === ALL ? NO_ITEMS : byKind[kind].filter((i) => catsOf(i).includes(g))), [g, byKind, kind])
  const items = g === CONT ? cont : g === FAV ? favorites : inGroup
  const rails = useMemo(() => {
    if (g !== ALL) return []
    const by = new Map<string, Item[]>()
    for (const i of byKind[kind]) for (const c of catsOf(i)) { const a = by.get(c); if (!a) by.set(c, [i]); else if (a.length < RAIL_ITEMS) a.push(i) }
    return groups[kind].slice(0, MAX_RAILS).map((c) => [c, by.get(c) || []] as const).filter(([, a]) => a.length)
  }, [g, byKind, groups, kind])
  const cats = useApp((s) => s.catFilter[kind])
  const more = useApp((s) => s.moreFilter[kind])
  const nMore = moreCount(more)
  const setCatFilter = useApp((s) => s.setCatFilter)
  // every title the group can show: the source filter (useCatalogView) and the picked categories narrow it first
  const all = useMemo(() => {
    const base = g === CONT ? cont : g === FAV ? favorites : g === ALL ? byKind[kind] : inGroup
    const want = new Set(cats)
    return cats.length || nMore ? base.filter((i) => (!cats.length || catsOf(i).some((c) => want.has(c))) && (!nMore || matchMore(i, more, progress))) : base
  }, [g, cont, favorites, byKind, kind, inGroup, cats, more, nMore, progress])
  const sorts = useMemo(() => sortsFor(all, t), [all, t])
  // the grid: untouched ALL keeps its curated rail-merged sample; a refinement widens to every title, then narrows/orders it
  // sort once per order (Continue watching stays most recently watched first); typing only filters the sorted list, on the deferred query.
  // The sort is stable, so filtering after it gives the same order as sorting the filtered list.
  const sorted = useMemo(() => (g === CONT ? all : sortList(all, sort, lang)), [g, all, sort, lang])
  const dq = useDeferredValue(q).trim()
  const f = fold(dq)
  // any refinement (picked categories, a query or a non-default order) drops the curated rails in favour of the flat grid
  const refined = cats.length > 0 || nMore > 0 || !!dq || sort !== "default"
  const sample = g === ALL && !refined
  const list = useMemo(() => (sample ? [...new Set(rails.flatMap(([, a]) => a))] : f ? sorted.filter((i) => foldedName(i).includes(f)) : sorted), [sample, rails, sorted, f])
  const favSet = useMemo(() => new Set(favs), [favs])
  const toggleCat = useStable((c: string) => setCatFilter(kind, cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]))
  const toggleLock = useStable(async (c: string) => {
    if (c === CONT || c === FAV || c === ALL || !p?.pin || !groups[kind].includes(c)) return // only real categories lock: a genre pill would store a stray lock
    const k = lockKey(c)
    if (k && !(await askPin(p.pin))) return
    toggleLockStore(k ?? `${kind}|${c}`)
  })
  return {
    status, groups: groups[kind], genres, g, setG, items, list, cats, toggleCat, clearCats: useCallback(() => setCatFilter(kind, []), [setCatFilter, kind]), refined, activeCount: filter.length + cats.length + nMore,
    q, setQ, sort, setSort,
    sorts, rails, favorites,
    pct: useCallback((i: Item) => pctOf(progress, i), [progress]),
    isFav: useCallback((i: Item) => favSet.has(i.id), [favSet]),
    isLocked: useCallback((c: string) => !!findLock(locked, kind, c), [locked, kind]),
    canLock: !!p?.pin,
    toggleLock,
    open: useStable((i: Item) => open(i)),
    openCategory: useCallback((c: string) => go("category", { id: `${kind}|${c}` }), [go, kind]),
    openGenre: useCallback((n: string) => go("genre", { id: `${kind}|${n}` }), [go, kind]),
    kindLabel: t(kind === "movie" ? "hooks.browse.movies" : "hooks.browse.series"), page: kind === "movie" ? "movies" : "series",
  }
}
