import { useEffect, useMemo, useState } from "react"
import { useMeta, useSimilar } from "@/lib/meta"
import { explain } from "@/lib/net"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { useApp, usePData } from "@/lib/store"
import { withMeta, type SourceMeta } from "@/lib/sources"
import { srcOfId } from "@/lib/merge-pure"
import { useOpen } from "@/components/tv/ui"
import type { Meta } from "@/lib/meta/types"
import type { Episode, Item } from "@/lib/types"
import { plexDetail } from "@/lib/plex"
import { seriesInfo, vodInfo } from "@/lib/xtream"

type Info = Record<string, string | number | undefined>

/** Rating chips: merged provider ratings, else the Xtream/catalog rating. */
export type DetailRating = { source: string; value: string; votes?: string }

/**
 * Everything a Detail page needs; overrides only render.
 * Returns {
 *  item (undefined = not in catalog; the item of the route id, used for favorites), selected (the Item that plays / whose info is shown; = item until selectSource),
 *  alternatives: { item, source }[] (primary + alts, priority order; one entry = only one source), selectSource(item) (switch source: reloads its info/episodes), isSeries, meta (merged TMDB/OMDb/Xtream or null), loading (metadata still loading), error,
 *  plot, chips (year/runtime strings), genres (<=4), ratings, poster (Item whose logo falls back to meta poster), backdrop (url|undefined),
 *  cast (meta.cast), directors, castText (raw Xtream cast string),
 *  episodes, seasons (numbers), season (selected, null = none), setSeason, shown (episodes of the season),
 *  progress(x) -> {pos,dur,t}|undefined, pct(x) -> 0..100, watched(x), epLabel(e) -> "E3  ·  45m  ·  Watched",
 *  resumeIdx, resumeLabel ("Resume"|"Play"), canPlay, play(queue|null, index) -> opens the player, playMain() (resume/play button),
 *  fav, toggleFav(), similar: Item[], open(item) (PIN-aware, live -> player), openCategory(), openGenre(g), openPerson(castMember), back()
 * }
 */
export function useDetail(id: string) {
  const item = useCatalog((s) => s.byId.get(id))
  const primary = useCatalog((s) => s.primaryOf.get(id)) ?? item // the deduped card (carries alts)
  const sources = useApp((s) => s.sources)
  const [pickId, setPickId] = useState<string | undefined>()
  useEffect(() => setPickId(undefined), [id])
  const alternatives = useMemo(() => {
    const out: { item: Item; source: SourceMeta }[] = []
    for (const i of primary ? [primary, ...(primary.alts ?? [])] : []) {
      const s = sources.find((x) => x.id === srcOfId(i.id))
      if (s) out.push({ item: i, source: withMeta(s) })
    }
    return out
  }, [primary, sources])
  const selected = alternatives.find((a) => a.item.id === pickId)?.item ?? item
  const src = selected && sources.find((x) => x.id === srcOfId(selected.id))
  const selId = selected?.id
  const proxy = useApp((s) => s.settings.proxy)
  const toggleFavStore = useApp((s) => s.toggleFav)
  const d = usePData()
  const go = useRoute((s) => s.go)
  const back = useRoute((s) => s.back)
  const [info, setInfo] = useState<Info>({})
  const [episodes, setEps] = useState<Episode[]>([])
  const [season, setSeason] = useState<number | null>(null)
  const [base, setBase] = useState<Partial<Meta> | undefined>() // Plex: server data merged first
  const [error, setErr] = useState("")
  const [loaded, setLoaded] = useState(false) // Xtream info fetched (or not applicable): metadata providers can start
  const open = useOpen()

  useEffect(() => {
    if (!selected) return
    setBase(undefined); setInfo({}); setEps([]); setSeason(null); setErr("")
    if (!src || src.type === "m3u" || !selected.sid) return setLoaded(true)
    let live = true
    const run = src.type === "plex"
      ? plexDetail(src, proxy, selected).then((r) => { if (live) { setInfo(r.info as Info); setBase(r.meta); setEps(r.episodes); setSeason(r.episodes[0]?.season ?? null) } })
      : selected.kind === "series"
      ? seriesInfo(src, proxy, selected).then((r) => { if (live) { setInfo(r.info); setEps(r.episodes); setSeason(r.episodes[0]?.season ?? null) } })
      : vodInfo(src, proxy, selected.sid).then((r) => live && setInfo(r))
    run.catch((e) => live && setErr(explain(e))).finally(() => live && setLoaded(true))
    return () => { live = false }
  }, [selId, src, proxy]) // eslint-disable-line react-hooks/exhaustive-deps

  const { meta, loading } = useMeta(selected, info, loaded, base)
  const similar = useSimilar(item, meta)
  const seasons = useMemo(() => [...new Set(episodes.map((e) => e.season))], [episodes])
  const isSeries = item?.kind === "series"
  const progress = (x: { id: string }) => d.progress[x.id]
  const pct = (x: { id: string }) => { const q = progress(x); return q ? Math.round((q.pos / q.dur) * 100) : 0 }
  const watched = (x: { id: string }) => !!progress(x) && progress(x).pos / progress(x).dur > 0.95
  // resume: the last-touched episode if unfinished, otherwise the one after it
  const resumeIdx = (() => {
    if (!isSeries) return 0
    const last = episodes.map((e, i) => [i, progress(e.item)?.t ?? 0] as const).sort((a, b) => b[1] - a[1])[0]
    return last && last[1] ? Math.min(episodes.length - 1, last[0] + (watched(episodes[last[0]].item) ? 1 : 0)) : 0
  })()
  const play = (queue: Episode[] | null, i: number) => selected && go("player", { queue: queue ? queue.map((e) => e.item) : [selected], index: i })
  const text = (k: string) => (info[k] ? String(info[k]) : "")
  const plot = meta?.plot || text("plot") || text("description") || item?.plot
  const chips = [meta?.year || text("releasedate").slice(0, 4) || text("releaseDate").slice(0, 4) || text("year"), meta?.runtime || text("duration")].filter(Boolean) as string[]
  const genres = (meta?.genres.length ? meta.genres : text("genre").split(/\s*[,/]\s*/)).filter(Boolean).slice(0, 4)
  const ratings: DetailRating[] = meta?.ratings.length ? meta.ratings : [text("rating") || item?.rating].filter(Boolean).map((v) => ({ source: "Rating", value: String(v), votes: undefined }))
  const poster = item && (item.logo ? item : ({ ...item, logo: meta?.poster } as Item))
  const p = selected && progress(selected)
  const hasProgress = isSeries ? episodes.some((e) => progress(e.item)) : !!p && p.pos > 30

  return {
    item, selected, alternatives, selectSource: (i: Item) => setPickId(i.id), isSeries, meta, loading, error, plot, chips, genres, ratings, poster, backdrop: meta?.backdrop || item?.logo,
    cast: meta?.cast ?? [], directors: meta?.directors ?? [], castText: text("cast"),
    episodes, seasons, season, setSeason, shown: episodes.filter((e) => e.season === season),
    progress, pct, watched,
    epLabel: (e: Episode) => [`E${e.num}`, e.dur, watched(e.item) ? "Watched" : ""].filter(Boolean).join("  ·  "),
    resumeIdx, resumeLabel: hasProgress ? "Resume" : "Play", canPlay: !isSeries || episodes.length > 0, play,
    playMain: () => (isSeries ? episodes.length && play(episodes, resumeIdx) : play(null, 0)),
    fav: !!item && d.favs.includes(item.id), toggleFav: () => item && toggleFavStore(item.id),
    similar, open: (i: Item) => open(i),
    openCategory: () => item && go("category", { id: `${item.kind}|${item.group}` }),
    openGenre: (g: string) => item && go("genre", { id: `${item.kind}|${g}` }),
    openPerson: (c: { id?: string; name: string }) => go("person", { id: c.id, name: c.name }),
    back,
  }
}
