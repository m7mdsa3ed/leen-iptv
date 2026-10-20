import { Backdrop } from "@/components/Backdrop"
import { Fragment, useState, type ReactNode } from "react"
import { ArrowLeft, Bookmark, BookmarkCheck, Check, ChevronLeft, ChevronRight, Clapperboard, Info, MoreHorizontal, Play, RefreshCw, Star, X } from "lucide-react"
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
import { SourceBadge, SourceChooser } from "../source-ui"

type D = ReturnType<typeof useDetail>
type Tab = "episodes" | "about" | "cast" | "trailers" | "similar"
const DIRECT = ["Director"], CREATE = ["Creator"], WRITE = ["Writer", "Screenplay", "Story", "Novel", "Teleplay"]
const DAY = { year: "numeric", month: "short", day: "numeric" } as const

/**
 * Details, one composition for movies and shows. The backdrop stays fixed behind the page and fades into it; over it a poster card
 * (md and up) beside the title block: title art, meta line, ratings, plot, genre pills, the action bar (Play / Trailer / Watched /
 * Watchlist / More), a credits line and the source picker. Below, tabs show one section at a time: Episodes (shows: season pills
 * over episode rows; a row plays, its (i) opens the episode dialog), About, Cast & crew, Trailers, More like this.
 */
export default function Detail({ id }: { id: string }) {
  const t = useT()
  const { lang } = useLang()
  const D = useDetail(id)
  const ready = useCatalog((s) => s.status === "ready")
  const [tab, setTab] = useState<Tab | null>(null)
  const [ep, setEp] = useState<Episode | null>(null)
  const { item, isSeries, loading, plot, ratings, poster, backdrops, fav, toggleFav, similar, open, stream, seasons, season, shown } = D
  const re = isSeries ? D.episodes[D.resumeIdx] : undefined
  const rp = item && (isSeries ? re?.item : item)
  const pr = rp ? D.progress(rp) : undefined
  const left = D.resuming && pr && pr.dur > pr.pos ? Math.max(1, Math.ceil((pr.dur - pr.pos) / 60)) : 0
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
  const moviePct = !isSeries && D.selected ? D.pct(D.selected) : 0

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
  const tabs = ([
    ["episodes", t("gtv.detail.episodes"), isSeries],
    ["about", t("gtv.detail.about"), true],
    ["cast", t("gtv.detail.cast"), D.cast.length + D.crew.length > 0],
    ["trailers", t("gtv.detail.trailers"), D.trailers.length > 0],
    ["similar", t("gtv.detail.similar"), similar.length > 0],
  ] as [Tab, string, boolean][]).filter(([, , on]) => on)
  const cur = tabs.some(([k]) => k === tab) ? tab! : tabs[0][0]
  const menu = D.marks.slice(1) // marks[0] (watched) has its own button

  return (
    <Shell page={item.kind === "live" ? "live" : item.kind === "movie" ? "movies" : "series"} title={D.title} sub>
      {/* fixed backdrop: outside the scroller, so it stays put while the page scrolls over it */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {backdrops.length > 0 && <Backdrop srcs={backdrops} className="absolute inset-0" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent rtl:bg-gradient-to-l" />
      </div>
      <div className="under-top under-bleed under-bottom relative -mx-[var(--gx)] overflow-y-auto">
        {!isTv && <div className="absolute start-[var(--gx)] top-[var(--content-t)] z-10"><RoundButton label={t("gtv.back")} onClick={D.back}><ArrowLeft className="rtl-flip" /></RoundButton></div>}

        <section className="flex items-end gap-10 px-[var(--gx)] pb-8 pt-[calc(var(--content-t)+24vh)] md:min-h-[78vh] md:pt-[calc(var(--content-t)+4rem)]">
          {poster && (
            <div className="m-rise hidden w-52 shrink-0 md:block lg:w-64">
              <Art item={poster} className="w-full rounded-2xl shadow-2xl ring-1 ring-white/10" />
              {moviePct > 0 && moviePct < 95 && <div dir="ltr" className="mt-3 h-1 overflow-hidden rounded-full bg-foreground/15"><div className="h-full bg-[var(--plex)]" style={{ width: `${moviePct}%` }} /></div>}
            </div>
          )}
          <div className="m-rise min-w-0 max-w-3xl flex-1">
            <TitleArt title={D.title} logo={D.logo} className="text-4xl font-semibold tracking-tight md:text-6xl" />

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-foreground/80">
              <SourceBadge item={D.selected ?? item} className="text-sm" />
              {(D.selected ?? item).imax && <span className="rounded border border-foreground/40 px-1.5 text-xs font-semibold">IMAX</span>}
              {facts.map((f, i) => <Fragment key={f}>{i > 0 && <span aria-hidden className="opacity-50">·</span>}<span className={f === D.meta?.cert ? "rounded border border-foreground/40 px-1.5 text-sm" : undefined}>{f}</span></Fragment>)}
              {loading && <RefreshCw role="status" aria-label={t("gtv.detail.loading")} className="size-4 animate-spin text-muted-foreground" />}
            </div>
            {ratings.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">{ratings.map((r) => <Score key={r.source} r={r} name={D.ratingName(r.source)} />)}</div>}

            {plot ? <p dir="auto" className="mt-4 line-clamp-4 text-base leading-relaxed text-foreground/90 md:text-lg">{plot}</p>
              : loading && <div role="status" aria-label={t("gtv.detail.loading")} className="mt-4 space-y-3"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div>}
            {D.genres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {D.genres.map((g) => <button key={g} data-nav data-pill onClick={() => D.openGenre(g)} className="min-h-9 rounded-full border border-foreground/25 px-3.5 text-sm text-foreground/85 hover:bg-[var(--fg-10)]">{g}</button>)}
              </div>
            )}

            <div className="-ms-1 mt-6 flex flex-wrap items-center gap-3 p-1">
              {D.resumeAt > 0 ? (
                // in progress: Play asks Resume from 12:34 / Play from beginning
                <ActionsMenu
                  items={[{ label: t("gtv.detail.resumeFrom", { time: mmss(D.resumeAt) }), run: () => D.playMain() }, { label: t("gtv.detail.fromStart"), run: () => D.playMain(true) }]}
                  trigger={(o) => <Pill variant="primary" data-autofocus="" aria-haspopup="menu" aria-expanded={o.open} onClick={o.toggle} disabled={!D.canPlay} className="min-h-12 px-6 text-base"><Play className="fill-current" />{mainLabel}</Pill>}
                />
              ) : <Pill variant="primary" data-autofocus="" onClick={() => D.playMain()} disabled={!D.canPlay} className="min-h-12 px-6 text-base"><Play className="fill-current" />{mainLabel}</Pill>}
              {D.trailer && <Pill onClick={() => openTrailer(D.trailer!)}><Clapperboard />{t("trailer.button")}</Pill>}
              <Pill aria-pressed={D.allWatched} onClick={D.toggleWatched} className={D.allWatched ? "bg-[var(--plex)] text-[var(--plex-fg)]" : undefined}><Check />{t(D.allWatched ? "hooks.detail.markUnwatched" : "hooks.detail.markWatched")}</Pill>
              <Pill aria-pressed={fav} onClick={toggleFav}>{fav ? <BookmarkCheck /> : <Bookmark />}{fav ? t("gtv.home.removeWatchlist") : t("gtv.home.addWatchlist")}</Pill>
              {menu.length > 0 && <ActionsMenu items={menu} trigger={(o) => <RoundButton label={t("common.moreOptions")} active={o.open} aria-haspopup="menu" aria-expanded={o.open} onClick={o.toggle}><MoreHorizontal /></RoundButton>} />}
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

        <div className="px-[var(--gx)] pb-10">
          <div data-nav-group="memory" role="tablist" aria-label={D.title} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto border-b border-foreground/10 px-1 pb-3">
            {tabs.map(([k, label]) => (
              <button key={k} data-nav data-pill role="tab" aria-selected={k === cur} onClick={() => setTab(k)} onFocus={() => isTv && setTab(k)}
                className={cn("min-h-11 shrink-0 rounded-full px-5 text-base", k === cur ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:bg-[var(--fg-10)] hover:text-foreground")}>
                {label}
              </button>
            ))}
          </div>

          <div key={cur} role="tabpanel" className="m-fade pt-5">
            {cur === "episodes" && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {seasons.length > 1 ? (
                    <div data-nav-group="memory" className="no-scrollbar flex gap-2 overflow-x-auto">
                      {seasons.map((x) => <Pill key={x} variant={x === season ? "primary" : "tonal"} aria-pressed={x === season} onClick={() => D.setSeason(x)}>{t("gtv.detail.season", { n: x })}</Pill>)}
                    </div>
                  ) : <span />}
                  {shown.length > 0 && <p className="text-sm text-muted-foreground">{t("gtv.detail.seasonSeen", { seen: fmt.number(seen), total: fmt.number(shown.length) })}</p>}
                </div>
                {season !== null
                  ? <div className="mt-4 flex flex-col gap-2">{shown.map((e) => <EpisodeRow key={e.id} e={e} D={D} onInfo={() => setEp(e)} />)}</div>
                  : loading
                    ? <div aria-hidden className="mt-4 flex flex-col gap-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="flex gap-4 p-2"><div className="skel aspect-video w-40 shrink-0 rounded-xl md:w-56" /><div className="flex-1 space-y-3 py-1"><SkelBar className="w-1/2" /><SkelBar className="w-1/4" /><SkelBar className="w-full" /></div></div>)}</div>
                    : <p className="mt-4 text-base text-muted-foreground">{t("gtv.detail.noEpisodes")}</p>}
              </>
            )}

            {cur === "about" && (
              <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="min-w-0">
                  {D.tagline && <p dir="auto" className="mb-3 text-xl font-semibold">{D.tagline}</p>}
                  {plot ? <p dir="auto" className="text-base leading-relaxed text-foreground/85 md:text-lg">{plot}</p> : loading && <div className="space-y-3"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div>}
                  <Awards text={D.awards} className="mt-4" />
                  {D.next && <p className="mt-4 text-base text-foreground/80">{t("gtv.detail.next", { code: t("pages.episode.code", { s: D.next.s, e: D.next.e }), date: fmt.date(new Date(`${D.next.air}T12:00:00`), DAY) })}</p>}
                </div>
                <Rows rows={rows} className="content-start rounded-3xl bg-surface/70 p-5" />
              </div>
            )}

            {cur === "cast" && (
              <div data-nav-group className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
                {[...D.cast.slice(0, 30), ...D.crew].map((c, i) => <PersonTile key={`${c.name}:${i}`} p={c} onOpen={() => D.openPerson(c)} />)}
              </div>
            )}

            {cur === "trailers" && <div data-nav-group className="flex flex-wrap gap-4">{D.trailers.map((v) => <TrailerTile key={v.key} v={v} />)}</div>}

            {cur === "similar" && <div data-nav-group className="flex flex-wrap gap-4">{similar.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</div>}
          </div>
        </div>
      </div>
      {ep && <EpisodeDialog D={D} e={ep} onPick={(e) => { if (e.season !== D.season) D.setSeason(e.season); setEp(e) }} onClose={() => setEp(null)} />}
    </Shell>
  )
}

/** An episode: the row plays it (still with a play mark, "E3" + title, length · air date, two lines of plot); (i) beside it opens its details dialog. */
function EpisodeRow({ e, D, onInfo }: { e: Episode; D: D; onInfo: () => void }) {
  const t = useT()
  const meta = D.epMeta(e)
  const seen = D.watched(e.item)
  const pct = D.pct(e.item)
  const current = D.episodes[D.resumeIdx]?.id === e.id
  const plot = e.item.plot || meta?.plot
  const sub = [D.epDur(e.dur), meta?.air && fmt.date(new Date(`${meta.air}T12:00:00`), DAY)].filter(Boolean).join(" · ")
  return (
    <div className="flex items-center gap-2">
      <button data-nav onClick={() => D.playEp(e)} aria-current={current ? "true" : undefined} aria-label={`${t("pages.episode.play")} ${t("pages.episode.code", { s: e.season, e: e.num })} ${e.title}`}
        className="gtv-ep group flex min-w-0 flex-1 items-center gap-4 rounded-2xl p-2 text-start md:gap-5">
        <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:w-44 md:w-56">
          {e.item.logo ? <img src={e.item.logo} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-3xl font-semibold text-muted-foreground">{fmt.number(e.num)}</div>}
          <span aria-hidden className="absolute inset-0 m-auto grid size-11 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"><Play className="size-5 fill-current" /></span>
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
          {E.resumeAt > 0 ? (
            <ActionsMenu
              items={[{ label: t("gtv.detail.resumeFrom", { time: mmss(E.resumeAt) }), run: () => play() }, { label: t("gtv.detail.fromStart"), run: () => play(true) }]}
              trigger={(o) => <Pill variant="primary" data-autofocus="" aria-haspopup="menu" aria-expanded={o.open} onClick={o.toggle}><Play className="fill-current" />{t("pages.episode.resume")}</Pill>}
            />
          ) : <Pill variant="primary" data-autofocus="" onClick={() => play()}><Play className="fill-current" />{t("pages.episode.play")}</Pill>}
          <RoundButton label={t(E.watched ? "hooks.detail.markUnwatched" : "hooks.detail.markWatched")} aria-pressed={E.watched} onClick={() => D.toggleEpWatched(e)} className={E.watched ? "bg-[var(--plex)] text-[var(--plex-fg)]" : undefined}><Check /></RoundButton>
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
