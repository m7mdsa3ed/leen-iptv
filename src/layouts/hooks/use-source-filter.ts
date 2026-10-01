import { useMemo } from "react"
import { useCatalog } from "@/lib/catalog"
import { onlySource, srcOfId } from "@/lib/merge-pure"
import { useSources } from "@/lib/sources"
import { useApp } from "@/lib/store"
import type { Item, Kind } from "@/lib/types"

/**
 * Source filter state for the pill bar. Returns {
 *  sources: { id, name, label, color, count }[] (enabled sources, priority order; count = titles/channels loaded),
 *  filter: string | null (null = All), setFilter(id | null), multi (more than one enabled source: show badges/filter)
 * }
 */
export function useSourceFilter() {
  const list = useSources()
  const stats = useCatalog((s) => s.sources)
  const filter = useApp((s) => s.sourceFilter)
  const setFilter = useApp((s) => s.setSourceFilter)
  const sources = useMemo(() => list.map((s) => ({ id: s.id, name: s.name, label: s.label, color: s.color, count: stats[s.id]?.count ?? 0 })), [list, stats])
  return { sources, filter: filter && list.some((s) => s.id === filter) ? filter : null, setFilter, multi: list.length > 1 }
}

/** Active filter id (null = All; a disabled/removed source counts as All). */
export function useActiveFilter(): string | null {
  const f = useApp((s) => s.sourceFilter)
  const ok = useApp((s) => !!f && s.sources.some((x) => x.id === f && x.enabled !== false))
  return ok ? f : null
}

/** Is this item (by its own source) visible under the filter? Used for favorites/history lists. */
export const inSource = (i: { id: string }, filter: string | null) => !filter || srcOfId(i.id) === filter

/**
 * Catalog with the source filter applied: { items, byKind, groups } (same shapes as the catalog store).
 * With a filter, a deduped title shows as that source's own item (primary or alt). byId is NOT filtered (ids keep resolving).
 */
export function useCatalogView() {
  const items = useCatalog((s) => s.items)
  const byKind = useCatalog((s) => s.byKind)
  const groups = useCatalog((s) => s.groups)
  const filter = useActiveFilter()
  return useMemo(() => {
    if (!filter) return { items, byKind, groups }
    const k = { live: onlySource(byKind.live, filter), movie: onlySource(byKind.movie, filter), series: onlySource(byKind.series, filter) }
    const g = (kind: Kind) => { const s = new Set(k[kind].map((i: Item) => i.group)); return groups[kind].filter((x) => s.has(x)) }
    return { items: [...k.live, ...k.movie, ...k.series], byKind: k, groups: { live: g("live"), movie: g("movie"), series: g("series") } }
  }, [filter, items, byKind, groups])
}
