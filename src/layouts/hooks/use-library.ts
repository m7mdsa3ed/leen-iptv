import { useMemo } from "react"
import { useOpen } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { useApp, usePData } from "@/lib/store"
import type { Item, Source } from "@/lib/types"
import { inSource, useActiveFilter } from "./use-source-filter"

const CAP = 60

/**
 * The user's own stuff. Returns {
 *  status, favorites: Item[] (watchlist, newest first), history: Item[] (recents, newest first),
 *  continueWatching: Item[] (unfinished, >30s in, most recent first), inProgress: Item[] (alias of continueWatching, kept for overrides),
 *  pct(item) progress % | undefined, isFav(item), toggleFav(item),
 *  sources: Source[], sourceId (active), setSource(id), removeSource(id), addSource() (opens the Sources page),
 *  open(item) (PIN-aware; live -> player)
 * }
 */
export function useLibrary() {
  const status = useCatalog((s) => s.status)
  const byId = useCatalog((s) => s.byId)
  const d = usePData()
  const filter = useActiveFilter()
  const sources = useApp((s) => s.sources)
  const sourceId = useApp((s) => s.sourceId)
  const setSource = useApp((s) => s.setSource)
  const removeSource = useApp((s) => s.removeSource)
  const toggleFav = useApp((s) => s.toggleFav)
  const go = useRoute((s) => s.go)
  const open = useOpen()
  const lists = useMemo(() => {
    const get = (ids: string[]) => ids.map((i) => byId.get(i)).filter((x) => x && inSource(x, filter)).slice(0, CAP) as Item[]
    const p = Object.entries(d.progress).filter(([, v]) => v.dur > 0 && v.pos / v.dur < 0.95 && v.pos > 30).sort((a, b) => b[1].t - a[1].t).map(([k]) => k)
    return { favorites: get(d.favs), history: get(d.recents), continueWatching: get(p) }
  }, [d, byId, filter])
  return {
    status, ...lists, inProgress: lists.continueWatching,
    pct: (i: Item) => d.progress[i.id] && (d.progress[i.id].pos / d.progress[i.id].dur) * 100,
    isFav: (i: Item) => d.favs.includes(i.id), toggleFav: (i: Item) => toggleFav(i.id),
    sources: sources as Source[], sourceId, setSource, removeSource, addSource: () => go("sources"), openHistory: () => go("history"), openStats: () => go("stats"),
    open: (i: Item) => open(i),
  }
}
