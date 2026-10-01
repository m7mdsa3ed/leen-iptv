import { useMemo, useState } from "react"
import { ALL, FAV } from "@/components/tv/groups"
import { useOpen } from "@/components/tv/ui"
import { nowNext, useCatalog } from "@/lib/catalog"
import { useApp, usePData } from "@/lib/store"
import type { Item } from "@/lib/types"
import { useCatalogView } from "./use-source-filter"

export { ALL, FAV }
/** Percent of a programme elapsed. */
export const progressPct = (s: number, e: number) => Math.max(0, Math.min(100, ((Date.now() - s) / (e - s)) * 100))

/**
 * Live TV data.
 * Returns {
 *  status, channels (all live Items), groups (live category names), g / setG (ALL | FAV | category), items (channels of g),
 *  sel / setSel (focused channel), now / next (EPG programmes {s,e,t,d?} of sel; undefined when none),
 *  nowOf(item) -> {now, next} programmes, epg, isFav(item), toggleFav(item), open(item, queue = items) (opens the player with zapping queue)
 * }
 */
export function useLive() {
  const { status, epg } = useCatalog()
  const { byKind, groups } = useCatalogView()
  const d = usePData()
  const toggleFav = useApp((s) => s.toggleFav)
  const open = useOpen()
  const [g, setG] = useState(ALL)
  const [sel, setSel] = useState<Item | null>(null)
  const items = useMemo(() => (g === ALL ? byKind.live : g === FAV ? byKind.live.filter((i) => d.favs.includes(i.id)) : byKind.live.filter((i) => i.group === g)), [g, byKind, d.favs])
  const nowOf = (i: Item) => nowNext(epg, i.epgId)
  const { now, next } = sel ? nowOf(sel) : ({} as ReturnType<typeof nowNext>)
  return {
    status, channels: byKind.live, groups: groups.live, g, setG, items, sel, setSel, now, next, nowOf, epg,
    isFav: (i: Item) => d.favs.includes(i.id), toggleFav: (i: Item) => toggleFav(i.id),
    open: (i: Item, queue: Item[] = items) => open(i, queue),
  }
}
