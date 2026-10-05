import { useEffect, useMemo, useRef, useState } from "react"
import { fmt, useT } from "@/lib/i18n"
import { normalizeCfg, useMeta, useSeasonMeta, useSimilar } from "@/lib/meta"
import { enrichEpisodes } from "@/lib/meta/episodes"
import { streamInfo } from "@/lib/meta/facts-pure"
import { cleanTitle } from "@/lib/meta/title"
import { explain } from "@/lib/net"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { useApp, usePData } from "@/lib/store"
import { withMeta, type SourceMeta } from "@/lib/sources"
import { srcOfId } from "@/lib/merge-pure"
import { useOpen } from "@/components/tv/ui"
import { openMatch } from "@/components/tv/match"
import type { EpisodeMeta, Meta } from "@/lib/meta/types"
import type { Episode, Item } from "@/lib/types"
import { plexDetail, plexScrobble, plexUnscrobble } from "@/lib/plex"
import { jellyfinDetail, jellyfinMarkPlayed, jellyfinMarkUnplayed } from "@/lib/jellyfin"
import { seriesInfo, vodInfo } from "@/lib/xtream"

type Info = Record<string, string | number | undefined>

/** Rating chips: merged provider ratings, else the Xtream/catalog rating. */
export type DetailRating = { source: string; value: string; votes?: string }

/**
 * Everything a Detail page needs; overrides only render.
 * Returns {
 *  item (undefined = not in catalog; the item of the route id, used for favorites), selected (the Item that plays / whose info is shown; = item until selectSource),
 *  alternatives: { item, source }[] (primary + alts, priority order; one entry = only one source), selectSource(item) (switch source: reloads its info/episodes), isSeries, meta (merged TMDB/OMDb/Xtream or null), loading (metadata still loading), error,
 *  logo (TMDB title art url|undefined; most are white: show on dark backgrounds), awards (OMDb line|undefined),
 *  title (heading: the matched TMDB title after a manual match, else the catalog name), plot, chips (year/runtime strings), genres (<=4), ratings, poster (Item whose logo falls back to meta poster; the metadata poster wins when there is one), backdrop (url|undefined),
 *  cast (meta.cast), directors, castText (raw Xtream cast string), crew (tappable people with a localised role: creators, directors, writers, producers...; falls back to the director names),
 *  tagline, original (original title when it differs), status (localised), next ({air,s,e}|undefined: next episode to air), languages / countries (ISO codes), studios, stream (StreamFacts of the SELECTED source: res, video, audio, ch, box, size bytes, added epoch s, langs),
 *  episodes (the selected season's gaps filled from TMDB: generic titles, stills, plots; after a manual match TMDB replaces them), epMeta(e) (TMDB air date/rating/guests/crew of an episode of the selected season), openEpisode(e) (episode page), markItems(items, seen) (single items, server too), seasons (numbers), season (selected, null = none), setSeason, shown (episodes of the season),
 *  progress(x) -> {pos,dur,t}|undefined, pct(x) -> 0..100, watched(x), epLabel(e) -> "E3  ·  45m  ·  Watched",
 *  resumeIdx, resumeLabel (localised "Resume"|"Play"), resuming (true = Resume; compare this, not the label), ratingName(source) (localises the generic "Rating" source name), canPlay, play(queue|null, index) -> opens the player, playMain() (resume/play button),
 *  trailer ({key,name}|undefined, TMDB/YouTube), trailers (all of them: trailers, teasers, featurettes), trailerLoading,
 *  fav, toggleFav(), similar: Item[], open(item) (PIN-aware, live -> player), openCategory(), openGenre(g), openPerson(castMember), back()
 * }
 */
export function useDetail(id: string) {
  const t = useT()
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
  const [rawEps, setEps] = useState<Episode[]>([])
  const [season, setSeason] = useState<number | null>(null)
  const [base, setBase] = useState<Partial<Meta> | undefined>() // Plex/Jellyfin: server data merged first
  const [error, setErr] = useState("")
  const [loaded, setLoaded] = useState(false) // Xtream info fetched (or not applicable): metadata providers can start
  const open = useOpen()

  useEffect(() => {
    if (!selected) return
    setBase(undefined); setInfo({}); setEps([]); setSeason(null); setErr("")
    if (!src || src.type === "m3u" || !selected.sid) return setLoaded(true)
    let live = true
    const run = src.type === "plex" || src.type === "jellyfin"
      ? (src.type === "plex" ? plexDetail : jellyfinDetail)(src, proxy, selected).then((r) => { if (live) { setInfo(r.info as Info); setBase(r.meta); setEps(r.episodes); setSeason(r.episodes[0]?.season ?? null) } })
      : selected.kind === "series"
      ? seriesInfo(src, proxy, selected).then((r) => { if (live) { setInfo(r.info); setEps(r.episodes); setSeason(r.episodes[0]?.season ?? null) } })
      : vodInfo(src, proxy, selected.sid).then((r) => live && setInfo(r))
    run.catch((e) => live && setErr(explain(e))).finally(() => live && setLoaded(true))
    return () => { live = false }
  }, [selId, src, proxy]) // eslint-disable-line react-hooks/exhaustive-deps

  const metaIdentity = primary ? `${primary.kind}:${srcOfId(primary.id)}:${primary.id}` : id
  const { meta, loading, matched, online, refresh: refreshMeta, rev } = useMeta(selected, info, loaded, base, metaIdentity)
  const similar = useSimilar(item, meta)
  const seasonMeta = useSeasonMeta(item?.kind === "series" ? meta?.ids.tmdb : undefined, season, rev)
  const seriesName = useMemo(() => (item ? cleanTitle(item.srcName ?? item.name).title : ""), [item]) // panel episode names repeat the panel's series name
  const episodes = useMemo(() => enrichEpisodes(rawEps, season, seasonMeta, seriesName, item?.logo, !!matched) // matched by hand: TMDB episode names/stills/plots win
    .map((e) => (e.item.epTitle === e.title ? e : { ...e, item: { ...e.item, epTitle: e.title } })), [rawEps, season, seasonMeta, seriesName, item?.logo, matched]) // the player shows the episode title
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
  // first load of a show: open the season you are in (the resume episode's), not always the first one
  const autoSeason = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!rawEps.length || autoSeason.current === selId) return
    autoSeason.current = selId
    const s = episodes[resumeIdx]?.season
    if (s != null && s !== season) setSeason(s)
  }, [rawEps]) // eslint-disable-line react-hooks/exhaustive-deps
  // where the player resumes an item (same rule as player/use-tracking): unfinished local progress, else the server's offset; 0 = from the start
  const resumeOf = (x?: Item) => { const q = x && progress(x); return q && q.pos > 30 && q.pos / q.dur < 0.95 ? q.pos : !q && x?.resume && x.resume > 30 ? x.resume : 0 }
  const play = (queue: Episode[] | null, i: number, fromStart?: boolean) => selected && go("player", { queue: queue ? queue.map((e) => e.item) : [selected], index: i, start: fromStart || undefined })
  const dur = (d?: string | number) => (typeof d === "number" ? fmt.duration(d) : d)
  const text = (k: string) => (info[k] ? String(info[k]) : "")
  const named = (prefix: string, raw: string) => { const k = `gtv.${prefix}.${raw.toLowerCase().replace(/\W+/g, "-")}`; const v = t(k); return v === k ? raw : v } // localised when a key exists, else TMDB's English
  const crew = (meta?.crew?.length ? meta.crew : (meta?.directors ?? []).map((name) => ({ name, role: isSeries ? "Creator" : "Director" }))).map((c) => ({ ...c, role: c.role?.split(", ").map((r) => named("role", r)).join(", ") }))
  const plot = meta?.plot || text("plot") || text("description") || item?.plot
  const releaseDate = text("releasedate") || text("releaseDate") || text("PremiereDate")
  const chips = [meta?.year || releaseDate.slice(0, 4) || text("year"), dur(meta?.runtime) || text("duration"), meta?.cert].filter(Boolean) as string[]
  const genres = (meta?.genres.length ? meta.genres : text("genre").split(/\s*[,/]\s*/)).filter(Boolean).slice(0, 4)
  const ratings: DetailRating[] = meta?.ratings.length ? meta.ratings : [text("rating") || item?.rating].filter(Boolean).map((v) => ({ source: "Rating", value: String(v), votes: undefined }))
  const poster = item && ({ ...item, logo: item.mposter ? item.logo : meta?.poster || item.logo } as Item) // identified or matched: the metadata poster replaces the panel's (Plex/Jellyfin: their own art is already in meta)
  const metaCfg = useApp((s) => s.settings.meta)
  const canMatch = useMemo(() => normalizeCfg(metaCfg).some((c) => c.id === "tmdb" && c.enabled && !!c.key), [metaCfg]) // manual match needs a TMDB key
  const markSeen = useApp((s) => s.markSeen)
  const targets = isSeries ? [...episodes.map((e) => e.item), ...(item ? [item] : [])] : selected ? [selected] : []
  // Plex/Jellyfin: tell the server too. A series is one call on the series item (the server cascades to its episodes).
  const markAll = (seen: boolean) => {
    markSeen(targets, seen)
    if (!selected?.sid || !src) return
    if (src.type === "plex") (seen ? plexScrobble : plexUnscrobble)(src, selected)
    else if (src.type === "jellyfin") (seen ? jellyfinMarkPlayed : jellyfinMarkUnplayed)(src, selected)
  }
  /** mark single items (an episode) watched/unwatched, on the Plex/Jellyfin server too */
  const markItems = (items: Item[], seen: boolean) => {
    markSeen(items, seen)
    if (src?.type === "plex" || src?.type === "jellyfin") for (const i of items) if (i.sid) (src.type === "plex" ? (seen ? plexScrobble : plexUnscrobble) : seen ? jellyfinMarkPlayed : jellyfinMarkUnplayed)(src, i)
  }
  // Remove from Continue: only what is in progress (a series: its unfinished episodes + the series entry), never the watched ones
  const removeContinue = () => {
    const part = (x: { id: string }) => { const q = progress(x); return !!q && q.pos > 0 && q.pos / q.dur < 0.95 }
    const eps = isSeries ? episodes.map((e) => e.item).filter(part) : selected ? [selected] : []
    markSeen([...eps, ...(isSeries && item ? [item] : [])], false)
    if (src?.type === "plex" || src?.type === "jellyfin") for (const e of eps) if (e.sid) (src.type === "plex" ? plexUnscrobble : jellyfinMarkUnplayed)(src, e)
  }
  const allWatched = isSeries ? episodes.length > 0 && episodes.every((e) => watched(e.item)) : !!selected && watched(selected)
  const p = selected && progress(selected)
  const hasProgress = isSeries ? episodes.some((e) => progress(e.item)) : !!p && p.pos > 30

  return {
    logo: meta?.logo, awards: meta?.awards, releaseDate, markItems,
    epMeta: (e: Episode): EpisodeMeta | undefined => (e.season === season ? seasonMeta?.find((x) => x.num === e.num) : undefined),
    openEpisode: (e: Episode) => go("episode", { id: `${id}~${e.item.id}` }),
    item, selected, title: (matched && meta?.title) || item?.name || "", alternatives, selectSource: (i: Item) => setPickId(i.id), isSeries, meta, loading, error, plot, chips, genres, ratings, poster, backdrop: meta?.backdrop || item?.logo,
    backdrops: [...new Set([meta?.backdrop || item?.logo, ...(meta?.backdrops ?? [])].filter((x): x is string => !!x))].slice(0, 6),
    cast: meta?.cast ?? [], directors: meta?.directors ?? [], castText: text("cast"), crew,
    tagline: meta?.tagline, original: meta?.original, status: meta?.status ? named("status", meta.status) : undefined, next: meta?.next, languages: meta?.languages ?? [], countries: meta?.countries ?? [], studios: meta?.studios ?? [],
    stream: streamInfo(info),
    episodes, seasons, season, setSeason, shown: episodes.filter((e) => e.season === season),
    progress, pct, watched,
    epDur: dur,
    epLabel: (e: Episode) => [t("hooks.detail.ep", { n: e.num }), dur(e.dur), watched(e.item) ? t("hooks.detail.watched") : ""].filter(Boolean).join("  ·  "),
    resumeIdx, resumeLabel: t(hasProgress ? "hooks.detail.resume" : "hooks.detail.play"), resuming: hasProgress, ratingName: (s: string) => (s === "Rating" ? t("hooks.detail.rating") : s), canPlay: !isSeries || episodes.length > 0, play,
    playMain: (fromStart?: boolean) => (isSeries ? episodes.length && play(episodes, resumeIdx, fromStart) : play(null, 0, fromStart)),
    /** where the main button resumes (seconds; 0 = nothing to resume): the Detail page then offers Resume / Play from beginning */
    resumeAt: resumeOf(isSeries ? episodes[resumeIdx]?.item : selected), resumeOf,
    /** watch-state buttons: [Mark watched | Mark unwatched], while something is in progress [Remove from Continue watching], with a TMDB key [Match metadata], with an online provider [Refresh metadata]; shown in the layout's overflow menu */
    marks: [
      { label: t(allWatched ? "hooks.detail.markUnwatched" : "hooks.detail.markWatched"), run: () => markAll(!allWatched) },
      ...(hasProgress && !allWatched ? [{ label: t("hooks.detail.removeContinue"), run: removeContinue }] : []),
      ...(canMatch && selected ? [{ label: t("hooks.detail.match"), run: () => openMatch(selected) }] : []),
      ...(online ? [{ label: t("hooks.detail.refreshMeta"), run: () => void refreshMeta() }] : []), // cached for 30 days; this fetches now
    ],
    allWatched, toggleWatched: () => markAll(!allWatched), // the same action as marks[0], for a dedicated button
    fav: !!item && d.favs.includes(item.id), toggleFav: () => item && toggleFavStore(item.id),
    trailers: meta?.trailers ?? [],
    trailer: meta?.trailers?.[0] ? { key: meta.trailers[0].key, name: meta.trailers[0].name } : undefined, trailerLoading: loading,
    similar, open: (i: Item) => open(i),
    openCategory: () => item && go("category", { id: `${item.kind}|${item.group}` }),
    openGenre: (g: string) => item && go("genre", { id: `${item.kind}|${g}` }),
    openPerson: (c: { id?: string; name: string }) => go("person", { id: c.id, name: c.name }),
    back,
  }
}
