import { useMemo } from "react"
import { useApp } from "./store"
import { useCatalog } from "./catalog"
import type { Source } from "./types"
import { srcOfId } from "./merge-pure"

export { srcOfId }

export const SOURCE_COLORS: Record<Source["type"], string> = { xtream: "#3b82f6", m3u: "#64748b", plex: "#e5a00d", jellyfin: "#aa5cc3" }
export const SOURCE_LABELS: Record<Source["type"], string> = { xtream: "IPTV", m3u: "M3U", plex: "Plex", jellyfin: "Jellyfin" }
/** 8 swatches for the color picker (first four = the type defaults). */
export const SOURCE_SWATCHES = ["#3b82f6", "#64748b", "#e5a00d", "#aa5cc3", "#10b981", "#ef4444", "#ec4899", "#06b6d4"]

export type SourceMeta = Source & { color: string; label: string; enabled: boolean }

export const sourceColor = (s?: Source | null) => (s ? s.color || SOURCE_COLORS[s.type] : SOURCE_COLORS.xtream)
export const sourceLabel = (s?: Source | null) => (s ? s.label?.trim() || SOURCE_LABELS[s.type] : "")
export const withMeta = (s: Source): SourceMeta => ({ ...s, color: sourceColor(s), label: sourceLabel(s), enabled: s.enabled !== false })

/** The source an item (or item id) belongs to (non-reactive; use useSourceOf in components). */
export const sourceOf = (item: { id: string }): Source | undefined => {
  const id = srcOfId(item.id)
  return useApp.getState().sources.find((s) => s.id === id)
}
/** id -> SourceMeta, rebuilt once per `sources` array (not per tile): every badge reads the same object. */
let metaOf: Source[] | null = null
let metaMap = new Map<string, SourceMeta>()
const metaMapFor = (sources: Source[]) => {
  if (sources !== metaOf) { metaOf = sources; metaMap = new Map(sources.map((s) => [s.id, withMeta(s)])) }
  return metaMap
}
export const useSourceOf = (item?: { id: string }): SourceMeta | undefined => {
  const id = item && srcOfId(item.id)
  return useApp((s) => (id === undefined ? undefined : metaMapFor(s.sources).get(id)))
}

/** Enabled sources (priority order) with resolved color/label. */
export function useSources(): SourceMeta[] {
  const sources = useApp((s) => s.sources)
  return useMemo(() => sources.filter((s) => s.enabled !== false).map(withMeta), [sources])
}

/** Readable text color (dark or white) for a chip with 6-digit hex background. */
export const onColor = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16) || 0; return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? "#111111" : "#ffffff" }

/** Badges show with more than one connected source (enabled, loading or loaded; one that failed to load does not count) and settings.sourceBadges on. Two primitive selectors, cheap per tile. */
export const useBadges = () => useBadgesOr()

/** useBadges, unless the page already computed it (`given`): then no per-tile work at all. */
export const useBadgesOr = (given?: boolean) => {
  const on = useApp((s) => given === undefined && s.settings.sourceBadges !== false)
  const many = useCatalog((c) => { if (given !== undefined) return false; let n = 0; for (const id in c.sources) if (c.sources[id].status !== "error" && ++n > 1) return true; return false }) // catalog.sources only holds enabled sources (loadAll drops the rest)
  return given ?? (on && many)
}
