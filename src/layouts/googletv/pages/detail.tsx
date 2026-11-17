import { Backdrop } from "@/components/Backdrop"
import { Fragment, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react"
import { ArrowLeft, Bookmark, BookmarkCheck, Check, ChevronLeft, ChevronRight, Clapperboard, Info, LayoutGrid, List, MoreHorizontal, Play, RefreshCw, Star, X } from "lucide-react"
import { useApp } from "@/lib/store"
import { ActionsMenu } from "@/components/tv/actions-menu"
import { Empty, Shell } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { Art, Card, Pill, RoundButton, SkelBar } from "@/components/gtv"
import { isTv, useMode } from "@/lib/device"
import { fmt, useLang, useT } from "@/lib/i18n"
import { useBackStep } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { mmss } from "@/player/util"
import { openTrailer } from "@/components/TrailerModal"
import { useDetail, type DetailRating } from "@/layouts/hooks/use-detail"
import type { Episode } from "@/lib/types"
import type { Person, Trailer } from "@/lib/meta/types"
import { Awards, TitleArt } from "@/components/tv/title-art"
import { WhereToWatch } from "@/components/tv/where-to-watch"
import { SourceBadge, SourceChooser } from "../source-ui"
import { GRail } from "../parts"

type D = ReturnType<typeof useDetail>
const DIRECT = ["Director"], CREATE = ["Creator"], WRITE = ["Writer", "Screenplay", "Story", "Novel", "Teleplay"]
const DAY = { year: "numeric", month: "short", day: "numeric" } as const
const LONG_PLOT = 200 // characters: a longer hero plot gets More / Less

/**
 * Details, one composition for movies and shows (layout.css "Details").
 * 1. A cinematic hero that fills the first screen: the backdrop full bleed (behind the transparent side rail), shaded only on the text side and the
 *    bottom; over it the kind eyebrow, title art, facts, ratings, genres, a 3-line plot that expands in place, then the action bar: one big Play
 *    (Resume from / Play from beginning when in progress, with the progress inside the button) and round captioned actions (Trailer, Watchlist,
 *    Watched, More). Credits line and the source picker under it.
 * 2. Everything else is ONE scroll of sections, no tabs (nothing hidden behind an extra press; Down on the remote discovers it):
 *    Episodes (shows: season chips, list / grid), Trailers & extras, Cast & crew, More like this, About (poster, full plot, facts, where to watch).
 * Desktop / tablet: once the hero's actions scroll away a slim bar (Back, title, Play) stays at the top. Phones: the art sits above the text.
 */
export default function Detail({ id }: { id: string }) {
  const t = useT()
  const { lang } = useLang()
  const D = useDetail(id)
  const ready = useCatalog((s) => s.status === "ready")
  const mobile = useMode() === "mobile"
  const [ep, setEp] = useState<Episode | null>(null)
  const [more, setMore] = useState(false) // hero plot expanded in place
  const [compact, setCompact] = useState(false) // the hero's actions scrolled out of view: the slim bar shows (desktop / tablet)
  const scroller = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLDivElement>(null)
  const uid = useId()
  const grid = useApp((s) => s.settings.epView === "grid")
  const setSettings = useApp((s) => s.setSettings)
  const { item, isSeries, loading, plot, ratings, poster, backdrops, fav, toggleFav, similar, open, stream, seasons, season, shown } = D
  const has = !!item
  useEffect(() => setMore(false), [id])
  useEffect(() => {
    const el = actions.current, root = scroller.current
    if (isTv || mobile || !el || !root) return setCompact(false)
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting && e.boundingClientRect.top < 0), { root })
    io.observe(el)
    return () => io.disconnect()
  }, [has, mobile])

  const re = isSeries ? D.episodes[D.resumeIdx] : undefined
  const rp = item && (isSeries ? re?.item : item)
  const pr = rp ? D.progress(rp) : undefined
  const left = D.resuming && pr && pr.dur > pr.pos ? Math.max(1, Math.ceil((pr.dur - pr.pos) / 60)) : 0
  const barPct = D.resuming && rp ? D.pct(rp) : 0
  const code = re ? t("pages.episode.code", { s: re.season, e: re.num }) : ""
  const mainLabel = isSeries && re
    ? [t(D.resuming ? "gtv.detail.resumeEp" : "gtv.detail.playEp", { code }), left ? fmt.plural("gtv.minLeft", left) : ""].filter(Boolean).join(" · ")
    : left ? fmt.plural("gtv.detail.resumeLeft", left) : D.resuming ? t("gtv.detail.resume") : t("gtv.detail.watch")
  // a title that is not in the catalog (a stale link, a removed source) is a page with a way out, not a blank screen
  if (!item) return <Empty><div className="flex flex-col items-center gap-4">{ready ? t("common.notFound") : t("common.loading")}{ready && <Pill variant="primary" data-autofocus="" onClick={D.back}>{t("common.back")}</Pill>}</div></Empty>

  const names = (type: "language" | "region", codes: string[]) => codes.map((c) => { try { const n = new Intl.DisplayNames([lang], { type }).of(c); return n && n !== c ? n : c } catch { return c } }).join(", ")
  const src = D.alternatives.find((a) => a.item.id === D.selected?.id)?.source
  const gb = stream.size ? `${fmt.number(Math.round(stream.size / 1e8) / 10)} GB` : ""
  const audio = [stream.audio, stream.ch, stream.langs?.length ? names("language", stream.langs) : ""].filter(Boolean).join(" · ")
  const seen = isSeries ? shown.filter((e) => D.watched(e.item)).length : 0

  // credits by their raw (English) TMDB role; tapping a name opens the person
  const crewBy = (roles: string[]) => (D.meta?.crew ?? []).filter((c) => (c.role ?? "").split(", ").some((r) => roles.includes(r)))
  const directors = crewBy(isSeries ? CREATE : DIRECT)
  const leads = directors.length ? directors : D.directors.map((name) => ({ name }) as Person)
  const people = (ps: Person[], n = 3) => ps.length > 0 && ps.slice(0, n).map((p, i) => (
    <Fragment key={p.name}>{i > 0 && ", "}<button data-nav onClick={() => D.openPerson(p)} className="rounded underline-offset-4 hover:underline">{p.name}</button></Fragment>
  ))
  const rows: [string, ReactNode][] = [
    [t(isSeries ? "gtv.detail.createdBy" : "gtv.detail.directedBy"), people(leads)],
    [t("gtv.detail.writtenBy"), people(crewBy(WRITE))],
    [t("gtv.detail.starring"), D.cast.length ? people(D.cast, 6) : D.castText && <span className="line-clamp-2">{D.castText}</span>],
    [t(isSeries ? "gtv.detail.network" : "gtv.detail.studio"), D.studios.slice(0, 2).join(", ")],
    [t("gtv.detail.original"), D.original],
    [t("gtv.detail.status"), D.status],
    [t("gtv.detail.language"), D.languages.length ? names("language", D.languages) : ""],
    [t("gtv.detail.country"), D.countries.length ? names("region", D.countries) : ""],
    [t("gtv.detail.category"), item.group && <button data-nav onClick={() => D.openCategory()} className="rounded underline-offset-4 hover:underline">{item.group}</button>],
    [t("gtv.detail.video"), [stream.res, stream.video].filter(Boolean).join(" · ")],
    [t("gtv.detail.audio"), audio],
    [t("gtv.detail.format"), [stream.box, gb].filter(Boolean).join(" · ")],
    [t("gtv.detail.source"), src?.name],
    [t("gtv.detail.added"), stream.added ? fmt.date(new Date(stream.added * 1000), DAY) : ""],
  ]
  const facts = [...D.chips, isSeries && seasons.length > 0 ? fmt.plural("gtv.detail.seasons", seasons.length) : "", stream.res].filter(Boolean) as string[]
  const menu = D.marks.slice(1) // marks[0] (watched) has its own button
  const longPlot = !!plot && plot.length > LONG_PLOT

  // the main button: one element from the first paint (never disabled or swapped, so focus stays on it while episodes / progress load);
  // in progress it asks Resume from 12:34 / Play from beginning. `small` = the copy in the slim bar (no autofocus, no progress)
  const playButton = (small?: boolean) => (
    <ActionsMenu
      items={[{ label: t("gtv.detail.resumeFrom", { time: mmss(D.resumeAt) }), run: () => D.playMain() }, { label: t("gtv.detail.fromStart"), run: () => D.playMain(true) }]}
      trigger={(o) => (
        <Pill variant="primary" data-autofocus={small ? undefined : ""} aria-haspopup={D.resumeAt > 0 ? "menu" : undefined} aria-expanded={D.resumeAt > 0 ? o.open : undefined} aria-busy={D.waiting || undefined}
          onClick={(e) => (D.resumeAt > 0 ? o.toggle(e) : D.playMain())} className={cn("relative overflow-hidden", small ? "min-h-10 px-5 text-sm" : "gtv-play min-h-14 px-8 text-lg")}>
          {D.waiting ? <RefreshCw className="animate-spin" /> : <Play className="fill-current" />}<span className="truncate">{mainLabel}</span>
          {!small && barPct > 0 && barPct < 95 && <span aria-hidden dir="ltr" className="absolute inset-x-7 bottom-2 h-[3px] overflow-hidden rounded-full bg-background/25"><span className="block h-full rounded-full bg-[var(--plex)]" style={{ width: `${barPct}%` }} /></span>}
        </Pill>
      )}
    />
  )

  return (
    <Shell page={item.kind === "live" ? "live" : item.kind === "movie" ? "movies" : "series"} title={D.title} sub>
      <div ref={scroller} className="under-top under-bleed under-bottom relative -ms-[var(--gs)] -me-[var(--gx)] overflow-y-auto">
        {!isTv && !mobile && (
          <div className="sticky top-0 z-20 h-0">
            {compact && (
              <div className="m-fade absolute inset-x-0 top-0 flex items-center gap-3 border-b border-[var(--fg-10)] bg-background/85 pb-2 pe-[var(--gx)] ps-[var(--gs)] pt-[calc(var(--safe-t)+.5rem)] backdrop-blur-xl">
                <RoundButton label={t("gtv.back")} onClick={D.back} className="size-10 bg-transparent"><ArrowLeft className="rtl-flip" /></RoundButton>
                <div dir="auto" className="min-w-0 flex-1 truncate text-lg font-medium">{D.title}</div>
                {playButton(true)}
              </div>
            )}
          </div>
        )}

        <section aria-label={D.title} className="gtv-dhero relative flex flex-col justify-end pb-10 pe-[var(--gx)] ps-[var(--gs)]">
          <div aria-hidden className={cn("gtv-dhero-art", !backdrops.length && "bg-gradient-to-br from-accent-blue-container via-surface to-background")}>
            {backdrops.length > 0 && <Backdrop srcs={backdrops} className="absolute inset-0" />}
          </div>
          {!isTv && <div className="absolute start-[var(--gs)] top-[var(--content-t)] z-10"><RoundButton label={t("gtv.back")} onClick={D.back} className="bg-background/50 backdrop-blur"><ArrowLeft className="rtl-flip" /></RoundButton></div>}

          <div className="m-rise relative min-w-0 max-w-[46rem]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-[.16em] text-foreground/70">
              <span>{t(isSeries ? "gtv.detail.seriesLabel" : "gtv.detail.movieLabel")}</span>
              <SourceBadge item={D.selected ?? item} className="text-xs normal-case tracking-normal" />
              {(D.selected ?? item).imax && <span className="rounded border border-foreground/40 px-1.5 tracking-normal">IMAX</span>}
            </div>
            <TitleArt title={D.title} logo={D.logo} className="mt-3 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl" />

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-foreground/85">
              {facts.map((f, i) => <Fragment key={f}>{i > 0 && <span aria-hidden className="opacity-40">•</span>}<span className={f === D.meta?.cert ? "rounded border border-foreground/40 px-1.5 text-sm" : undefined}>{f}</span></Fragment>)}
              {ratings.length > 0 && <span aria-hidden className="opacity-40">•</span>}
              {ratings.map((r) => <Score key={r.source} r={r} name={D.ratingName(r.source)} />)}
              {loading && <RefreshCw role="status" aria-label={t("gtv.detail.loading")} className="size-4 animate-spin text-muted-foreground" />}
            </div>
            {D.genres.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-1 text-base text-foreground/70">
                {D.genres.map((g, i) => <Fragment key={g}>{i > 0 && <span aria-hidden className="opacity-50">,</span>}<button data-nav onClick={() => D.openGenre(g)} className="rounded px-0.5 underline-offset-4 hover:text-foreground hover:underline">{g}</button></Fragment>)}
              </div>
            )}

            {plot ? (
              <div className="mt-4">
                <p dir="auto" className={cn("text-base leading-relaxed text-foreground/90 md:text-lg", !more && "line-clamp-3")}>{plot}</p>
                {longPlot && <button data-nav aria-expanded={more} onClick={() => setMore((x) => !x)} className="mt-1 rounded text-sm font-semibold text-foreground/80 underline-offset-4 hover:underline">{t(more ? "gtv.detail.less" : "gtv.detail.more")}</button>}
              </div>
            ) : loading && <div role="status" aria-label={t("gtv.detail.loading")} className="mt-4 space-y-3"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div>}

            <div ref={actions} className="-ms-1 mt-7 flex flex-wrap items-center gap-x-4 gap-y-5 p-1 max-sm:flex-col max-sm:items-stretch">
              {playButton()}
              <div data-nav-group className="flex items-start gap-1 max-sm:grid max-sm:grid-cols-4">
                {D.trailer && <Act caption={t("trailer.button")} onClick={() => openTrailer(D.trailer!)}><Clapperboard /></Act>}
                <Act caption={t("gtv.detail.listShort")} label={fav ? t("gtv.home.removeWatchlist") : t("gtv.home.addWatchlist")} aria-pressed={fav} on={fav} onClick={toggleFav}>{fav ? <BookmarkCheck /> : <Bookmark />}</Act>
                <Act caption={t("hooks.detail.watched")} label={t(D.allWatched ? "hooks.detail.markUnwatched" : "hooks.detail.markWatched")} aria-pressed={D.allWatched} on={D.allWatched} onClick={D.toggleWatched}><Check /></Act>
                {menu.length > 0 && <ActionsMenu items={menu} trigger={(o) => <Act caption={t("gtv.detail.more")} label={t("common.moreOptions")} aria-haspopup="menu" aria-expanded={o.open} onClick={o.toggle}><MoreHorizontal /></Act>} />}
              </div>
            </div>
            {(leads.length > 0 || D.cast.length > 0) && (
              <p className="mt-5 text-base text-foreground/75">
                {leads.length > 0 && <><span className="text-muted-foreground">{t(isSeries ? "gtv.detail.createdBy" : "gtv.detail.directedBy")} </span>{people(leads, 2)}</>}
                {leads.length > 0 && D.cast.length > 0 && <span aria-hidden className="mx-2 opacity-50">·</span>}
                {D.cast.length > 0 && <><span className="text-muted-foreground">{t("gtv.detail.starring")} </span>{people(D.cast)}</>}
              </p>
            )}
            <SourceChooser className="mt-4" alternatives={D.alternatives} selected={D.selected} onSelect={D.selectSource} />
            {D.error && <p role="alert" className="mt-3 text-destructive">{D.error}</p>}
          </div>
        </section>

        <div className="relative flex flex-col gap-8 pb-12 pe-[var(--gx)] ps-[var(--gs)] pt-2">
          {isSeries && (
            <section aria-labelledby={`${uid}-eps`}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id={`${uid}-eps`} className="text-[1.4rem] font-normal">{t("gtv.detail.episodes")}</h2>
                  {shown.length > 0 && <p className="text-sm text-muted-foreground">{t("gtv.detail.seasonSeen", { seen: fmt.number(seen), total: fmt.number(shown.length) })}</p>}
                </div>
                {/* list / grid view of the episodes (synced display preference) */}
                <div data-nav-group className="flex gap-1 rounded-full bg-surface-2/70 p-1">
                  {([["list", List, "gtv.detail.epList"], ["grid", LayoutGrid, "gtv.detail.epGrid"]] as const).map(([v, Icon, k]) => (
                    <RoundButton key={v} label={t(k)} title={t(k)} aria-pressed={grid === (v === "grid")} active={grid === (v === "grid")} onClick={() => setSettings({ epView: v })}
                      className={cn("size-10", grid !== (v === "grid") && "bg-transparent text-muted-foreground")}><Icon /></RoundButton>
                  ))}
                </div>
              </div>
              {seasons.length > 1 && (
                <div data-nav-group="memory" className="rail !mb-0 !pb-3 !pt-4">
                  {seasons.map((x) => <Pill key={x} variant={x === season ? "primary" : "tonal"} aria-pressed={x === season} onClick={() => D.setSeason(x)} className="shrink-0">{t("gtv.detail.season", { n: x })}</Pill>)}
                </div>
              )}
              {season !== null
                ? grid
                  ? <div data-nav-group className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-4 gap-y-6 max-sm:grid-cols-2 max-sm:gap-x-3">{shown.map((e) => <EpisodeTile key={e.id} e={e} D={D} onInfo={() => setEp(e)} />)}</div>
                  : <div className="mt-4 flex flex-col gap-2">{shown.map((e) => <EpisodeRow key={e.id} e={e} D={D} onInfo={() => setEp(e)} />)}</div>
                : loading
                  ? grid
                    ? <div aria-hidden className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-4 gap-y-6 max-sm:grid-cols-2 max-sm:gap-x-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="p-1.5"><div className="skel aspect-video w-full rounded-xl" /><SkelBar className="mt-3 w-3/4" /><SkelBar className="mt-2 w-1/3" /></div>)}</div>
                    : <div aria-hidden className="mt-4 flex flex-col gap-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="flex gap-4 p-2"><div className="skel aspect-video w-40 shrink-0 rounded-xl md:w-56" /><div className="flex-1 space-y-3 py-1"><SkelBar className="w-1/2" /><SkelBar className="w-1/4" /><SkelBar className="w-full" /></div></div>)}</div>
                  : <p className="mt-4 text-base text-muted-foreground">{t("gtv.detail.noEpisodes")}</p>}
            </section>
          )}

          {D.trailers.length > 0 && <GRail title={t("gtv.detail.trailers")}>{D.trailers.map((v) => <TrailerTile key={v.key} v={v} />)}</GRail>}
          {D.cast.length + D.crew.length > 0 && <GRail title={t("gtv.detail.cast")}>{[...D.cast.slice(0, 30), ...D.crew].map((c, i) => <PersonTile key={`${c.name}:${i}`} p={c} onOpen={() => D.openPerson(c)} />)}</GRail>}
          {similar.length > 0 && <GRail title={t("gtv.detail.similar")}>{similar.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</GRail>}

          <section aria-labelledby={`${uid}-about`} className="grid gap-x-10 gap-y-6 md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1.25fr)_minmax(0,1fr)]">
            {poster && <div className="hidden w-40 md:block lg:w-48"><Art item={poster} className="w-full rounded-2xl shadow-xl ring-1 ring-[var(--fg-10)]" /></div>}
            <div className="min-w-0">
              <h2 id={`${uid}-about`} className="text-[1.4rem] font-normal">{t("gtv.detail.about")}</h2>
              {D.tagline && <p dir="auto" className="mt-3 text-lg font-semibold">{D.tagline}</p>}
              {plot ? <p dir="auto" className="mt-3 text-base leading-relaxed text-foreground/85">{plot}</p> : loading && <div className="mt-3 space-y-3"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div>}
              <Awards text={D.awards} className="mt-4" />
              {D.next && <p className="mt-4 text-base text-foreground/80">{t("gtv.detail.next", { code: t("pages.episode.code", { s: D.next.s, e: D.next.e }), date: fmt.date(new Date(`${D.next.air}T12:00:00`), DAY) })}</p>}
            </div>
            <div className="min-w-0 content-start md:col-span-2 lg:col-span-1">
              <Rows rows={rows} className="rounded-3xl bg-surface p-5" />
              <WhereToWatch avail={D.avail} className="mt-6" />
            </div>
          </section>
        </div>
      </div>
      {ep && <EpisodeDialog D={D} e={ep} onPick={(e) => { if (e.season !== D.season) D.setSeason(e.season); setEp(e) }} onClose={() => setEp(null)} />}
    </Shell>
  )
}

/** A round captioned action under the hero (Trailer, Watchlist, Watched, More): icon disc + short caption; `on` fills the disc (a toggle that is set).
 *  `label` = the full accessible name when the caption alone is too short to say what it does. */
function Act({ caption, label, on, children, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { caption: string; label?: string; on?: boolean }) {
  return (
    <button type="button" data-nav data-pill aria-label={label} {...p} className={cn("gtv-act", className)}>
      <span aria-hidden className={cn("gtv-act-ico", on && "gtv-act-on")}>{children}</span>
      <span aria-hidden={label ? true : undefined} className="gtv-act-cap">{caption}</span>
    </button>
  )
}

/** An episode: the row plays it (still with a play mark, "E3" + title, length · air date, two lines of plot); (i) beside it opens its details dialog. */
function EpisodeRow({ e, D, onInfo }: { e: Episode; D: D; onInfo: () => void }) {
  const t = useT()
  const meta = D.epMeta(e)
  const seen = D.watched(e.item)
  const pct = D.pct(e.item)
  const current = !e.missing && D.episodes[D.resumeIdx]?.id === e.id
  const plot = e.item.plot || meta?.plot
  const sub = [D.epDur(e.dur), e.missing ? D.missingLabel(e) : meta?.air && fmt.date(new Date(`${meta.air}T12:00:00`), DAY)].filter(Boolean).join(" · ")
  return (
    <div className="flex items-center gap-2">
      <button data-nav onClick={() => D.playEp(e)} aria-current={current ? "true" : undefined} aria-label={`${e.missing ? "" : t("pages.episode.play")} ${t("pages.episode.code", { s: e.season, e: e.num })} ${e.title}`} aria-disabled={e.missing || undefined}
        className={cn("gtv-ep group flex min-w-0 flex-1 items-center gap-4 rounded-2xl p-2 text-start md:gap-5", e.missing && "opacity-60")}>
        <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:w-44 md:w-56">
          {e.item.logo ? <img src={e.item.logo} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-3xl font-semibold text-muted-foreground">{fmt.number(e.num)}</div>}
          {!e.missing && <span aria-hidden className="absolute inset-0 m-auto grid size-11 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"><Play className="size-5 fill-current" /></span>}
          {seen && <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-black/70 text-white"><Check className="size-4" /></span>}
          {pct > 0 && !seen && <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/30"><div className="h-full bg-[var(--plex)]" style={{ width: `${pct}%` }} /></div>}
        </div>
        <div className="min-w-0 flex-1">
          {current && !seen && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--plex)]">{t(D.resuming ? "gtv.detail.continueEpisode" : "gtv.detail.upNext")}</div>}
          <div dir="auto" className="line-clamp-1 text-lg font-medium"><bdi className="me-2 text-muted-foreground">{t("hooks.detail.ep", { n: fmt.number(e.num) })}</bdi>{e.title}</div>
          {sub && <div className="mt-0.5 text-sm text-muted-foreground">{sub}</div>}
          {plot && <p dir="auto" className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-foreground/70 max-sm:hidden">{plot}</p>}
        </div>
      </button>
      <RoundButton label={t("gtv.detail.epInfo")} title={t("gtv.detail.epInfo")} onClick={onInfo} className="bg-transparent"><Info /></RoundButton>
    </div>
  )
}

/** An episode's still (or its number when there is none): play mark on hover/focus, watched check, progress bar. */
function EpStill({ e, seen, pct, className }: { e: Episode; seen: boolean; pct: number; className?: string }) {
  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-xl bg-surface-2", className)}>
      {e.item.logo ? <img src={e.item.logo} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-3xl font-semibold text-muted-foreground">{fmt.number(e.num)}</div>}
      {!e.missing && <span aria-hidden className="absolute inset-0 m-auto grid size-11 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"><Play className="size-5 fill-current" /></span>}
      {seen && <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-black/70 text-white"><Check className="size-4" /></span>}
      {pct > 0 && !seen && <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/30"><div className="h-full bg-[var(--plex)]" style={{ width: `${pct}%` }} /></div>}
    </div>
  )
}

/** The grid view of an episode: the tile plays it (still on top, "E3" + title over length · air date); (i) at the caption's end opens its details. */
function EpisodeTile({ e, D, onInfo }: { e: Episode; D: D; onInfo: () => void }) {
  const t = useT()
  const meta = D.epMeta(e)
  const seen = D.watched(e.item)
  const pct = D.pct(e.item)
  const current = !e.missing && D.episodes[D.resumeIdx]?.id === e.id
  const sub = [D.epDur(e.dur), e.missing ? D.missingLabel(e) : meta?.air && fmt.date(new Date(`${meta.air}T12:00:00`), DAY)].filter(Boolean).join(" · ")
  return (
    <div className="relative min-w-0">
      <button data-nav onClick={() => D.playEp(e)} aria-current={current ? "true" : undefined} aria-label={`${e.missing ? "" : t("pages.episode.play")} ${t("pages.episode.code", { s: e.season, e: e.num })} ${e.title}`} aria-disabled={e.missing || undefined}
        className={cn("gtv-ep group block w-full rounded-2xl p-1.5 text-start", e.missing && "opacity-60")}>
        <EpStill e={e} seen={seen} pct={pct} className={cn("w-full", current && !seen && "ring-2 ring-[var(--plex)]")} />
        <div className="mt-2.5 min-w-0 pe-11 ps-1">
          {current && !seen && <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--plex)]">{t(D.resuming ? "gtv.detail.continueEpisode" : "gtv.detail.upNext")}</div>}
          <div dir="auto" className="line-clamp-2 text-base font-medium leading-snug"><bdi className="me-1.5 text-muted-foreground">{t("hooks.detail.ep", { n: fmt.number(e.num) })}</bdi>{e.title}</div>
          {sub && <div className="mt-0.5 truncate text-sm text-muted-foreground">{sub}</div>}
        </div>
      </button>
      <RoundButton label={t("gtv.detail.epInfo")} title={t("gtv.detail.epInfo")} onClick={onInfo} className="absolute bottom-1 end-0 size-10 bg-transparent"><Info /></RoundButton>
    </div>
  )
}

/** The episode's details (what the episode page used to be): still with code + title, air date / length / rating, plot, credits,
 *  guest stars; Play (Resume from / Play from beginning), watched, previous / next episode. Back closes it. */
function EpisodeDialog({ D, e, onPick, onClose }: { D: D; e: Episode; onPick: (e: Episode) => void; onClose: () => void }) {
  const t = useT()
  const mobile = useMode() === "mobile"
  const E = D.epInfo(e)
  useBackStep(true, onClose)
  const play = (fromStart?: boolean) => { onClose(); D.playEp(e, fromStart) }
  const rows: [string, ReactNode][] = [[t("pages.episode.directedBy"), E.directors.join(", ")], [t("pages.episode.writtenBy"), E.writers.join(", ")]]
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={`${E.code} ${e.title}`} onClick={(ev) => ev.target === ev.currentTarget && onClose()}
      className={cn("fixed inset-0 z-50 flex m-fade bg-black/70", mobile ? "items-end" : "items-center justify-center p-4")}>
      <div className={cn("flex w-full flex-col overflow-hidden bg-surface text-foreground shadow-2xl", mobile ? "m-rise max-h-[92vh] rounded-t-[28px] pb-[var(--safe-b)]" : "m-pop max-h-[min(48rem,calc(100vh-2rem))] max-w-3xl rounded-[28px]")}>
        <div className="relative aspect-video max-h-[42vh] w-full shrink-0 overflow-hidden bg-surface-2">
          {(E.still || D.backdrops[0]) && <img src={E.still || D.backdrops[0]} alt="" decoding="async" className="size-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
          <button data-nav data-pill aria-label={t("common.close")} onClick={onClose} className="absolute end-3 top-3 grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur"><X className="size-5" /></button>
          <div className="absolute inset-x-0 bottom-0 px-6 pb-4">
            <div className="text-sm font-semibold uppercase tracking-wide text-[var(--plex)]">{E.code}</div>
            <h2 dir="auto" className="mt-1 line-clamp-2 text-2xl font-semibold tracking-tight md:text-3xl">{e.title}</h2>
          </div>
          {E.pct > 0 && E.pct < 95 && <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><div className="h-full bg-[var(--plex)]" style={{ width: `${E.pct}%` }} /></div>}
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-3">
          {(E.air || E.runtime || E.rating) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-foreground/80">
              {[E.air, E.runtime].filter(Boolean).map((x, i) => <Fragment key={x}>{i > 0 && <span aria-hidden className="opacity-50">·</span>}<bdi>{x}</bdi></Fragment>)}
              {E.rating && <Score r={{ source: "TMDB", value: E.rating }} name="TMDB" />}
            </div>
          )}
          {E.plot && <p dir="auto" className="mt-3 text-base leading-relaxed text-foreground/85">{E.plot}</p>}
          <Rows rows={rows} className="mt-4" />
          {E.guests.length > 0 && (
            <section className="mt-5">
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t("pages.episode.guests")}</h3>
              <div data-nav-group className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
                {E.guests.map((c, i) => <PersonTile key={`${c.name}:${i}`} p={c} onOpen={() => { onClose(); D.openPerson(c) }} />)}
              </div>
            </section>
          )}
        </div>

        <div data-nav-group className="flex items-center gap-2 border-t border-foreground/10 px-6 py-4">
          {e.missing ? <span className="text-base text-muted-foreground">{D.missingLabel(e)}</span> : <>
            {/* one button (never swapped, so focus stays on it when progress changes while the dialog is open); in progress it asks Resume from / Play from beginning */}
            <ActionsMenu
              items={[{ label: t("gtv.detail.resumeFrom", { time: mmss(E.resumeAt) }), run: () => play() }, { label: t("gtv.detail.fromStart"), run: () => play(true) }]}
              trigger={(o) => (
                <Pill variant="primary" data-autofocus="" aria-haspopup={E.resumeAt > 0 ? "menu" : undefined} aria-expanded={E.resumeAt > 0 ? o.open : undefined}
                  onClick={(ev) => (E.resumeAt > 0 ? o.toggle(ev) : play())}>
                  <Play className="fill-current" />{t(E.resumeAt > 0 ? "pages.episode.resume" : "pages.episode.play")}
                </Pill>
              )}
            />
            <RoundButton label={t(E.watched ? "hooks.detail.markUnwatched" : "hooks.detail.markWatched")} aria-pressed={E.watched} onClick={() => D.toggleEpWatched(e)} className={E.watched ? "bg-[var(--plex)] text-[var(--plex-fg)]" : undefined}><Check /></RoundButton>
          </>}
          <div className="ms-auto flex gap-2">
            <RoundButton label={t("pages.episode.prev")} disabled={!E.prev} className={!E.prev ? "opacity-40" : undefined} onClick={() => E.prev && onPick(E.prev)}><ChevronLeft className="rtl-flip" /></RoundButton>
            <RoundButton label={t("pages.episode.next")} disabled={!E.next} className={!E.next ? "opacity-40" : undefined} onClick={() => E.next && onPick(E.next)}><ChevronRight className="rtl-flip" /></RoundButton>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A rating with its source's mark (IMDb / TMDB badge, Rotten Tomatoes fresh or rotten dot, Metascore box, else a star). */
function Score({ r, name }: { r: DetailRating; name: string }) {
  const n = parseFloat(r.value)
  const mark = r.source === "IMDb" ? <b className="rounded-sm bg-[#f5c518] px-1 text-xs font-black leading-5 text-black">IMDb</b>
    : r.source === "TMDB" ? <b className="rounded-sm bg-[#01b4e4] px-1 text-xs font-black leading-5 text-[#0d253f]">TMDB</b>
    : r.source === "Rotten Tomatoes" ? <span className={cn("size-4 rounded-full", n >= 60 ? "bg-[#fa320a]" : "bg-[#0ac855]")} />
    : r.source === "Metascore" ? <b className={cn("grid h-6 min-w-6 place-items-center rounded-sm px-1 text-sm", n >= 61 ? "bg-[#66cc33] text-black" : n >= 40 ? "bg-[#ffcc33] text-black" : "bg-[#ff0000] text-white")}>{r.value}</b>
    : <Star className="size-4 fill-current text-[var(--plex)]" />
  return (
    <span className="inline-flex items-center gap-1.5 text-base font-medium">
      <span className="sr-only">{name}</span>{mark}{r.source !== "Metascore" && <span dir="ltr">{r.value}</span>}
    </span>
  )
}

/** Label / value rows (label column muted); rows with an empty value are dropped. */
function Rows({ rows, className }: { rows: [string, ReactNode][]; className?: string }) {
  const r = rows.filter(([, v]) => v)
  if (!r.length) return null
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-base", className)}>
      {r.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd dir="auto" className="min-w-0 break-words">{v}</dd></Fragment>)}
    </dl>
  )
}

/** YouTube still with a play mark, video name and type (provider text). Opens the trailer modal. */
function TrailerTile({ v }: { v: Trailer }) {
  return (
    <button data-nav data-card onClick={() => openTrailer(v)} className="block w-64 shrink-0 text-start">
      <div data-tilewrap className="relative rounded-2xl">
        <div data-tile className="relative aspect-video overflow-hidden rounded-[inherit] bg-surface">
          <img src={`https://i.ytimg.com/vi/${encodeURIComponent(v.key)}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          <span className="absolute inset-0 m-auto grid size-11 place-items-center rounded-full bg-black/60 text-white"><Play className="size-5 fill-current" /></span>
        </div>
        <span data-ring aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" />
      </div>
      <div className="card-info mt-2 px-1">
        <div dir="auto" className="truncate text-base text-foreground">{v.name}</div>
        <div className="truncate text-sm text-muted-foreground">{v.type}</div>
      </div>
    </button>
  )
}

/** Round photo (or initial), name, role. Opens the person page. */
function PersonTile({ p, onOpen }: { p: Person; onOpen: () => void }) {
  return (
    <button data-nav onClick={onOpen} className="flex w-28 shrink-0 flex-col items-center rounded-2xl p-1 text-center">
      {p.photo ? <img src={p.photo} alt="" loading="lazy" decoding="async" className="size-24 rounded-full bg-surface-2 object-cover" /> : <div className="grid size-24 place-items-center rounded-full bg-surface-2 text-2xl font-medium">{p.name.slice(0, 1)}</div>}
      <div dir="auto" className="mt-2 w-full truncate text-sm">{p.name}</div>
      {p.role && <div dir="auto" className="w-full truncate text-xs text-muted-foreground">{p.role}</div>}
    </button>
  )
}
