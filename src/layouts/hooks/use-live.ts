import { useMemo, useState } from "react"
import { ALL, FAV } from "@/components/tv/groups"
import { useOpen } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { useApp, useLists, usePData } from "@/lib/store"
import type { Item } from "@/lib/types"
import { useCatalogView } from "./use-source-filter"

export { ALL, FAV }
/**
 * Live TV data.
 * Returns {
 *  status, channels (all live Items), groups (custom list names, then live category names), lists (custom lists),
 *  g / setG (ALL | FAV | custom list name | category), items (channels of g),
 *  sel / setSel (focused channel), isFav(item), toggleFav(item), open(item, queue = items) (opens the player with zapping queue)
 * }
 */
export function useLive() {
  const { status } = useCatalog()
  const { byKind, groups: catGroups } = useCatalogView()
  const lists = useLists()
  const d = usePData()
  const toggleFav = useApp((s) => s.toggleFav)
  const open = useOpen()
  const [g, setG] = useState(ALL)
  const [sel, setSel] = useState<Item | null>(null)
  // the user's own lists come first; a list whose name matches a provider group replaces it (name is the key)
  const groups = useMemo(() => {
    const names = lists.map((l) => l.name)
    return [...names, ...catGroups.live.filter((x) => !names.includes(x))]
  }, [lists, catGroups.live])
  const items = useMemo(() => {
    if (g === ALL) return byKind.live
    if (g === FAV) return byKind.live.filter((i) => d.favs.includes(i.id))
    const list = lists.find((l) => l.name === g)
    return list ? byKind.live.filter((i) => list.items.includes(i.id)) : byKind.live.filter((i) => i.group === g)
  }, [g, byKind, d.favs, lists])
  return {
    status, channels: byKind.live, groups, lists, g, setG, items, sel, setSel,
    isFav: (i: Item) => d.favs.includes(i.id), toggleFav: (i: Item) => toggleFav(i.id),
    open: (i: Item, queue: Item[] = items) => open(i, queue),
  }
}
