import { useMemo, useState } from "react"
import { ALL, FAV } from "@/components/tv/groups"
import { askPin, useOpen } from "@/components/tv/ui"
import { useGenres } from "@/lib/meta"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { findLock } from "@/lib/merge-pure"
import { useApp, usePData, useProfile } from "@/lib/store"
import type { Item, Kind } from "@/lib/types"
import { useActiveFilter, useCatalogView, inSource } from "./use-source-filter"

const MAX_RAILS = 30
const RAIL_ITEMS = 20
export { ALL, FAV }

/**
 * Movies / Series browse data.
 * Returns {
 *  status ("idle"|"loading"|"ready"|"error"), groups (category names), genres (TMDB genre names for the kind),
 *  g / setG (selected pseudo group: ALL | FAV; real categories open their own page via openCategory), items (FAV list; [] for ALL),
 *  rails: [categoryName, Item[<=20]][] (<=30, only when g === ALL), favorites (this kind's favorite Items),
 *  pct(item) progress %|undefined, isFav(item), isLocked(cat), canLock (profile has a PIN), toggleLock(cat) (PIN-aware, ignores ALL/FAV),
 *  open(item) (PIN-aware), openCategory(cat), openGenre(name), kindLabel ("Movies"|"Series"), page ("movies"|"series")
 * }
 */
export function useBrowse(kind: Exclude<Kind, "live">) {
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
  const lockKey = (c: string) => findLock(p?.locked ?? [], kind, c)
  const favorites = useMemo(() => d.favs.map((id) => byId.get(id)).filter((i): i is Item => !!i && i.kind === kind && inSource(i, filter)), [byId, kind, d.favs, filter]) // via byId: favorites of deduped (alt) items still show
  const items = g === FAV ? favorites : g === ALL ? [] : byKind[kind].filter((i) => i.group === g)
  const rails = useMemo(() => {
    if (g !== ALL) return []
    const by = new Map<string, Item[]>()
    for (const i of byKind[kind]) { const a = by.get(i.group); if (!a) by.set(i.group, [i]); else if (a.length < RAIL_ITEMS) a.push(i) }
    return groups[kind].slice(0, MAX_RAILS).map((c) => [c, by.get(c) || []] as const).filter(([, a]) => a.length)
  }, [g, byKind, groups, kind])
  return {
    status, groups: groups[kind], genres, g, setG, items, rails, favorites,
    pct: (i: Item) => d.progress[i.id] && (d.progress[i.id].pos / d.progress[i.id].dur) * 100,
    isFav: (i: Item) => d.favs.includes(i.id),
    isLocked: (c: string) => !!lockKey(c),
    canLock: !!p?.pin,
    toggleLock: async (c: string) => {
      if (c === FAV || c === ALL || !p?.pin) return
      const k = lockKey(c)
      if (k && !(await askPin(p.pin))) return
      toggleLockStore(k ?? `${kind}|${c}`)
    },
    open: (i: Item) => open(i),
    openCategory: (c: string) => go("category", { id: `${kind}|${c}` }),
    openGenre: (n: string) => go("genre", { id: `${kind}|${n}` }),
    kindLabel: kind === "movie" ? "Movies" : "Series", page: kind === "movie" ? "movies" : "series",
  }
}
