import { useEffect } from "react"
import { fmt, useT } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"
import { srcOfId } from "@/lib/merge-pure"
import type { Episode } from "@/lib/types"
import { useDetail } from "./use-detail"

/**
 * Episode page: one episode of a series, with TMDB details where known. Route id = `<seriesId>~<episodeItemId>`.
 * Returns {
 *  D (the series' useDetail: title, logo, backdrops, back, ...), episode (undefined while loading / gone), missing (episodes loaded but this one is not among them),
 *  title, still, plot, code ("S1 · E3"), chips (air date, runtime), air / runtime (the same two, "" when unknown), rating (TMDB, "7.9"|undefined), guests, directors, writers,
 *  pct, resuming, resumeAt (seconds, 0 = none), watched, play(fromStart?), toggleWatched(), prev / next (Episode|undefined), openEp(e) (another episode, in place)
 * }
 */
export function useEpisode(routeId: string) {
  const t = useT()
  const cut = routeId.indexOf("~")
  const seriesId = routeId.slice(0, cut)
  const epId = routeId.slice(cut + 1)
  const D = useDetail(seriesId)
  const replace = useRoute((s) => s.replace)

  // follow the copy (source) the episode came from: Detail may have been switched to another source
  useEffect(() => {
    const want = srcOfId(epId)
    if (!D.selected || srcOfId(D.selected.id) === want) return
    const alt = D.alternatives.find((a) => srcOfId(a.item.id) === want)
    if (alt) D.selectSource(alt.item)
  }, [epId, D.selected?.id, D.alternatives]) // eslint-disable-line react-hooks/exhaustive-deps

  const index = D.episodes.findIndex((e) => e.item.id === epId)
  const episode = index >= 0 ? D.episodes[index] : undefined
  // TMDB details are fetched per season: select this episode's season
  useEffect(() => { if (episode && D.season !== episode.season) D.setSeason(episode.season) }, [episode?.season, D.season]) // eslint-disable-line react-hooks/exhaustive-deps

  const m = episode && D.epMeta(episode)
  const watched = !!episode && D.watched(episode.item)
  const p = episode && D.progress(episode.item)
  return {
    D, episode, missing: D.episodes.length > 0 && !episode,
    title: episode?.title ?? "",
    still: episode?.item.logo,
    plot: episode?.item.plot || m?.plot,
    code: episode ? t("pages.episode.code", { s: episode.season, e: episode.num }) : "",
    air: m?.air ? fmt.date(new Date(`${m.air}T12:00:00`), { year: "numeric", month: "long", day: "numeric" }) : "", runtime: D.epDur(episode?.dur) || "",
    chips: [m?.air && fmt.date(new Date(`${m.air}T12:00:00`), { year: "numeric", month: "long", day: "numeric" }), D.epDur(episode?.dur)].filter(Boolean) as string[],
    rating: m?.rating,
    guests: m?.guests ?? [], directors: m?.directors ?? [], writers: m?.writers ?? [],
    pct: episode ? D.pct(episode.item) : 0,
    resuming: !!p && p.pos > 30 && !watched,
    watched,
    resumeAt: D.resumeOf(episode?.item), // > 0: the page offers Resume from / Play from beginning
    play: (fromStart?: boolean) => { if (episode) D.play(D.episodes, index, fromStart) },
    toggleWatched: () => { if (episode) D.markItems([episode.item], !watched) },
    prev: index > 0 ? D.episodes[index - 1] : undefined,
    next: index >= 0 ? D.episodes[index + 1] : undefined,
    openEp: (e: Episode) => replace("episode", { id: `${seriesId}~${e.item.id}` }),
  }
}
