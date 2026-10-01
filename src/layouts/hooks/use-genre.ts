import { useMemo } from "react"
import { useOpen } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { useGenreTitles } from "@/lib/meta"
import { norm } from "@/lib/meta/title"
import { useRoute } from "@/lib/nav"
import { usePData } from "@/lib/store"
import type { Item } from "@/lib/types"
import { onlySource } from "@/lib/merge-pure"
import { useActiveFilter, useCatalogView } from "./use-source-filter"

/**
 * One genre page (route id `${kind}|${genre}`).
 * Returns { kind, genre, status, items (popular titles found in the catalog), available (a TMDB key is set), loading, unknown (TMDB has no such genre),
 *  hasMore, more() (search further), related (your own categories named like the genre), pct(item), open(item), openCategory(name), openSettings(), back() }
 */
export function useGenre(id: string) {
  const cut = id.indexOf("|")
  const kind = (id.slice(0, cut) === "series" ? "series" : "movie") as "movie" | "series"
  const genre = id.slice(cut + 1)
  const status = useCatalog((s) => s.status)
  const { groups } = useCatalogView()
  const filter = useActiveFilter()
  const d = usePData()
  const open = useOpen()
  const go = useRoute((s) => s.go)
  const back = useRoute((s) => s.back)
  const { items: all, available, loading, unknown, hasMore, more } = useGenreTitles(kind, genre)
  const items = useMemo(() => (filter ? onlySource(all, filter) : all), [all, filter])
  const related = useMemo(() => groups[kind].filter((g) => norm(g).includes(norm(genre))).slice(0, 8), [groups, kind, genre])
  return {
    kind, genre, status, items, available, loading, unknown, hasMore, more, related, back,
    pct: (i: Item) => d.progress[i.id] && (d.progress[i.id].pos / d.progress[i.id].dur) * 100,
    open: (i: Item) => open(i),
    openCategory: (g: string) => go("category", { id: `${kind}|${g}` }),
    openSettings: () => go("settings"),
  }
}
