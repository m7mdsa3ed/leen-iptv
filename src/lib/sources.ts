import { useMemo } from "react"
import { useApp } from "./store"
import type { Source } from "./types"
import { srcOfId } from "./merge-pure"

export { srcOfId }

export const SOURCE_COLORS: Record<Source["type"], string> = { xtream: "#3b82f6", m3u: "#64748b", plex: "#e5a00d" }
export const SOURCE_LABELS: Record<Source["type"], string> = { xtream: "IPTV", m3u: "M3U", plex: "Plex" }
/** 8 swatches for the color picker (first three = the type defaults). */
export const SOURCE_SWATCHES = ["#3b82f6", "#64748b", "#e5a00d", "#10b981", "#ef4444", "#ec4899", "#8b5cf6", "#06b6d4"]

export type SourceMeta = Source & { color: string; label: string; enabled: boolean }

export const sourceColor = (s?: Source | null) => (s ? s.color || SOURCE_COLORS[s.type] : SOURCE_COLORS.xtream)
export const sourceLabel = (s?: Source | null) => (s ? s.label?.trim() || SOURCE_LABELS[s.type] : "")
export const withMeta = (s: Source): SourceMeta => ({ ...s, color: sourceColor(s), label: sourceLabel(s), enabled: s.enabled !== false })

/** The source an item (or item id) belongs to (non-reactive; use useSourceOf in components). */
export const sourceOf = (item: { id: string }): Source | undefined => {
  const id = srcOfId(item.id)
  return useApp.getState().sources.find((s) => s.id === id)
}
export const useSourceOf = (item?: { id: string }): SourceMeta | undefined => {
  const sources = useApp((s) => s.sources)
  const id = item && srcOfId(item.id)
  return useMemo(() => { const s = sources.find((x) => x.id === id); return s && withMeta(s) }, [sources, id])
}

/** Enabled sources (priority order) with resolved color/label. */
export function useSources(): SourceMeta[] {
  const sources = useApp((s) => s.sources)
  return useMemo(() => sources.filter((s) => s.enabled !== false).map(withMeta), [sources])
}

/** Readable text color (dark or white) for a chip with 6-digit hex background. */
export const onColor = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16) || 0; return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? "#111111" : "#ffffff" }

/** One boolean selector: badges show with more than one enabled source and settings.sourceBadges on. Cheap per tile. */
export const useBadges = () => useApp((s) => s.settings.sourceBadges !== false && s.sources.filter((x) => x.enabled !== false).length > 1)
