import { useMemo } from "react"
import { useCatalog } from "@/lib/catalog"
import { onlySource, srcOfId } from "@/lib/merge-pure"
import { useSources } from "@/lib/sources"
import { useApp } from "@/lib/store"
import type { Item, Kind } from "@/lib/types"

/**
 * Source filter state for the pill bar. Returns {
 *  sources: { id, name, title (name, plus the type label when two sources share a name), label, color, count }[] (enabled sources, priority order, minus a Plex / Jellyfin that cannot be reached; count = titles/channels loaded),
 *  filter: string[] (picked source ids; [] = All), toggle(id), clear(), multi (more than one of those sources: show the filter)
 * }
 */
export function useSourceFilter() {
  const all = useSources()
  const stats = useCatalog((s) => s.sources)
  // catalog.ts drops an unreachable Plex / Jellyfin (no tiles), so it gets no chip either
  const list = useMemo(() => all.filter((s) => !((s.type === "plex" || s.type === "jellyfin") && stats[s.id]?.status === "error")), [all, stats])
  const picked = useApp((s) => s.sourceFilter)
  const setFilter = useApp((s) => s.setSourceFilter)
  const sources = useMemo(() => {
    // two sources with the same name (ignoring case) would be indistinguishable: append their type label ("Mohamed - Plex")
    const dup = new Map<string, number>()
    for (const s of list) dup.set(s.name.trim().toLowerCase(), (dup.get(s.name.trim().toLowerCase()) ?? 0) + 1)
    return list.map((s) => ({ id: s.id, name: s.name, title: (dup.get(s.name.trim().toLowerCase()) ?? 0) > 1 ? `${s.name} · ${s.label}` : s.name, label: s.label, type: s.type, color: s.color, count: stats[s.id]?.count ?? 0 }))
  }, [list, stats])
  // ids of sources that no longer exist (or are disabled) drop out, so a stale pick can never hide everything
  const filter = useMemo(() => picked.filter((id) => list.some((s) => s.id === id)), [picked, list])
  const toggle = (id: string) => setFilter(filter.includes(id) ? filter.filter((x) => x !== id) : [...filter, id])
  return { sources, filter, toggle, clear: () => setFilter([]), multi: list.length > 1 }
}

/** Active filter ids ([] = All; a disabled/removed source drops out). Stable while nothing changes, so it is safe as a memo dep. */
export function useActiveFilter(): string[] {
  const picked = useApp((s) => s.sourceFilter)
  const sources = useApp((s) => s.sources)
  return useMemo(() => picked.filter((id) => sources.some((x) => x.id === id && x.enabled !== false)), [picked, sources])
}

/** Is this item (by its own source) visible under the filter? Used for favorites/history lists. */
export const inSource = (i: { id: string }, filter: string[]) => !filter.length || filter.includes(srcOfId(i.id))

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
    if (!filter.length) return { items, byKind, groups }
    const k = { live: onlySource(byKind.live, filter), movie: onlySource(byKind.movie, filter), series: onlySource(byKind.series, filter) }
    const g = (kind: Kind) => { const s = new Set(k[kind].map((i: Item) => i.group)); return groups[kind].filter((x) => s.has(x)) }
    return { items: [...k.live, ...k.movie, ...k.series], byKind: k, groups: { live: g("live"), movie: g("movie"), series: g("series") } }
  }, [filter, items, byKind, groups])
}
