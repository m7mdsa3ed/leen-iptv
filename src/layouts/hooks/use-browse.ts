import { useMemo, useState } from "react"
import { ALL, FAV } from "@/components/tv/groups"
import { askPin, useOpen } from "@/components/tv/ui"
import { fold, useLang, useT } from "@/lib/i18n"
import { alphaIndex, byAdded, byRelease, matchMore, moreCount } from "@/lib/browse-pure"
import { useGenres } from "@/lib/meta"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { findLock } from "@/lib/merge-pure"
import { useApp, usePData, useProfile } from "@/lib/store"
import type { Item, Kind } from "@/lib/types"
import { byName, sortsFor, type Sort } from "./use-category"
import { useActiveFilter, useCatalogView, inSource } from "./use-source-filter"

const MAX_RAILS = 30
const RAIL_ITEMS = 20
export { ALL, FAV }

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
  const d = usePData()
  const p = useProfile()
  const toggleLockStore = useApp((s) => s.toggleLock)
  const open = useOpen()
  const go = useRoute((s) => s.go)
  const genres = useGenres(kind)
  const [g, setG] = useState(ALL)
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<Sort>("default")
  const { lang } = useLang()
  const lockKey = (c: string) => findLock(p?.locked ?? [], kind, c)
  const favorites = useMemo(() => d.favs.map((id) => byId.get(id)).filter((i): i is Item => !!i && i.kind === kind && inSource(i, filter)), [byId, kind, d.favs, filter]) // via byId: favorites of deduped (alt) items still show
  const items = g === FAV ? favorites : g === ALL ? [] : byKind[kind].filter((i) => i.group === g)
  const rails = useMemo(() => {
    if (g !== ALL) return []
    const by = new Map<string, Item[]>()
    for (const i of byKind[kind]) { const a = by.get(i.group); if (!a) by.set(i.group, [i]); else if (a.length < RAIL_ITEMS) a.push(i) }
    return groups[kind].slice(0, MAX_RAILS).map((c) => [c, by.get(c) || []] as const).filter(([, a]) => a.length)
  }, [g, byKind, groups, kind])
  const cats = useApp((s) => s.catFilter[kind])
  const more = useApp((s) => s.moreFilter[kind])
  const nMore = moreCount(more)
  const setCatFilter = useApp((s) => s.setCatFilter)
  // every title the group can show: the source filter (useCatalogView) and the picked categories narrow it first
  const all = useMemo(() => {
    const base = g === FAV ? favorites : g === ALL ? byKind[kind] : byKind[kind].filter((i) => i.group === g)
    const want = new Set(cats)
    return cats.length || nMore ? base.filter((i) => (!cats.length || want.has(i.group)) && (!nMore || matchMore(i, more, d.progress))) : base
  }, [g, favorites, byKind, kind, cats, more, nMore, d.progress])
  const sorts = useMemo(() => sortsFor(all, t), [all, t])
  // any refinement (picked categories, a query or a non-default order) drops the curated rails in favour of the flat grid
  const refined = cats.length > 0 || nMore > 0 || !!q.trim() || sort !== "default"
  // the grid: untouched ALL keeps its curated rail-merged sample; a refinement widens to every title, then narrows/orders it
  const list = useMemo(() => {
    const f = fold(q.trim())
    if (g === ALL && !refined) return [...new Set(rails.flatMap(([, a]) => a))]
    const l = f ? all.filter((i) => fold(i.name).includes(f)) : all
    if (sort === "az") return [...l].sort(byName(lang))
    if (sort === "rating") return [...l].sort((a, b) => (parseFloat(b.rating ?? "") || 0) - (parseFloat(a.rating ?? "") || 0))
    if (sort === "year") return [...l].sort(byRelease)
    if (sort === "added") return [...l].sort(byAdded)
    return l
  }, [g, all, rails, refined, q, sort, lang])
  // side index over the title-filtered list in A-Z order (base letters: É under E, أ under ا)
  const alpha = useMemo(() => {
    const f = fold(q.trim())
    const l = f ? all.filter((i) => fold(i.name).includes(f)) : all
    return alphaIndex([...l].sort(byName(lang)).map((i) => i.name), lang)
  }, [all, q, lang])
  const toggleCat = (c: string) => setCatFilter(kind, cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])
  return {
    status, groups: groups[kind], genres, g, setG, items, list, alpha, cats, toggleCat, clearCats: () => setCatFilter(kind, []), refined, activeCount: filter.length + cats.length + nMore,
    q, setQ, sort, setSort,
    sorts, rails, favorites,
    pct: (i: Item) => d.progress[i.id] && (d.progress[i.id].pos / d.progress[i.id].dur) * 100,
    isFav: (i: Item) => d.favs.includes(i.id),
    isLocked: (c: string) => !!lockKey(c),
    canLock: !!p?.pin,
    toggleLock: async (c: string) => {
      if (c === FAV || c === ALL || !p?.pin || !groups[kind].includes(c)) return // only real categories lock: a genre pill would store a stray lock
      const k = lockKey(c)
      if (k && !(await askPin(p.pin))) return
      toggleLockStore(k ?? `${kind}|${c}`)
    },
    open: (i: Item) => open(i),
    openCategory: (c: string) => go("category", { id: `${kind}|${c}` }),
    openGenre: (n: string) => go("genre", { id: `${kind}|${n}` }),
    kindLabel: t(kind === "movie" ? "hooks.browse.movies" : "hooks.browse.series"), page: kind === "movie" ? "movies" : "series",
  }
}
