import { useCallback, useMemo, useState } from "react"
import { ALL, CONT, FAV, useContinue } from "@/components/tv/groups"
import { useOpen } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { useApp, useLists, usePData } from "@/lib/store"
import type { Item } from "@/lib/types"
import { useStable } from "./use-category"
import { useCatalogView } from "./use-source-filter"

export { ALL, CONT, FAV }
/**
 * Live TV data.
 * Returns {
 *  status, channels (all live Items), groups (custom list names, then live category names), lists (custom lists),
 *  g / setG (ALL | CONT | FAV | custom list name | category), items (channels of g),
 *  sel / setSel (focused channel), isFav(item), toggleFav(item), open(item, queue = items) (opens the player with zapping queue)
 * }
 */
export function useLive() {
  const status = useCatalog((s) => s.status)
  const { byKind, groups: catGroups } = useCatalogView()
  const lists = useLists()
  const favs = usePData().favs
  const favSet = useMemo(() => new Set(favs), [favs])
  const toggleFav = useApp((s) => s.toggleFav)
  const open = useOpen()
  const cont = useContinue("live")
  const [g, setG] = useState(ALL)
  const [sel, setSel] = useState<Item | null>(null)
  // the user's own lists come first; a list whose name matches a provider group replaces it (name is the key)
  const groups = useMemo(() => {
    const names = lists.map((l) => l.name)
    return [...names, ...catGroups.live.filter((x) => !names.includes(x))]
  }, [lists, catGroups.live])
  const items = useMemo(() => {
    if (g === ALL) return byKind.live
    if (g === CONT) return cont
    if (g === FAV) return byKind.live.filter((i) => favSet.has(i.id))
    const list = lists.find((l) => l.name === g)
    if (!list) return byKind.live.filter((i) => i.group === g)
    const ids = new Set(list.items)
    return byKind.live.filter((i) => ids.has(i.id))
  }, [g, byKind.live, favSet, lists, cont])
  return {
    status, channels: byKind.live, groups, lists, g, setG, items, sel, setSel,
    isFav: useCallback((i: Item) => favSet.has(i.id), [favSet]), toggleFav: useCallback((i: Item) => toggleFav(i.id), [toggleFav]),
    open: useStable((i: Item, queue: Item[] = items) => open(i, queue)),
  }
}
