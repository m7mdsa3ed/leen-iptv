// Pure (no alias imports) so `node scripts/meta.check.ts` can test it.
import type { Episode } from "../types"
import type { EpisodeMeta } from "./types"

/** Panel episode names that say nothing: "Episode 3", "E03", "S01E03", "الحلقة 3", "<series name> - S1 E3", "". */
export function isGenericEpTitle(title: string | undefined, series = ""): boolean {
  let s = (title ?? "").toLowerCase()
  if (series) s = s.split(series.toLowerCase()).join(" ")
  s = s.replace(/(s(eason)?|e(p(isode)?)?)\s*\d+/g, " ").replace(/(الحلقة|حلقة|الموسم|موسم|مسلسل|episode|season)/g, " ")
  return !/[\p{L}]/u.test(s.replace(/[\d\p{P}\p{S}\s]+/gu, ""))
}

/**
 * Fill gaps in one season's panel episodes from provider data: generic titles, missing plot / duration, and the series poster used as a still.
 * `force` (the user matched this series by hand, so the provider is trusted): provider title / still / plot / runtime replace the panel's.
 * Episodes of other seasons are left alone; a provider title that is itself generic never replaces a real one. Returns the same array when nothing changes.
 */
export function enrichEpisodes(eps: Episode[], season: number | null, metas: EpisodeMeta[] | null, seriesName: string, seriesLogo?: string, force = false): Episode[] {
  if (!metas?.length || season === null) return eps
  let changed = false
  const out = eps.map((e) => {
    const m = e.season === season && e.num > 0 ? metas.find((x) => x.num === e.num) : undefined
    if (!m) return e
    const title = m.title && !isGenericEpTitle(m.title) && (force || isGenericEpTitle(e.title, seriesName)) ? m.title : e.title
    const logo = m.still && (force || !e.item.logo || e.item.logo === seriesLogo) ? m.still : e.item.logo
    const plot = force ? m.plot || e.item.plot : e.item.plot || m.plot
    const dur = force ? m.runtime || e.dur : e.dur || m.runtime
    if (title === e.title && logo === e.item.logo && plot === e.item.plot && dur === e.dur) return e
    changed = true
    return { ...e, title, dur, item: { ...e.item, logo, plot } }
  })
  return changed ? out : eps
}
