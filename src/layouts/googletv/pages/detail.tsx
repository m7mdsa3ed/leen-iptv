import { Backdrop } from "@/components/Backdrop"
import { Fragment, type CSSProperties, type ReactNode } from "react"
import { ArrowLeft, Bookmark, BookmarkCheck, Calendar, Check, Clapperboard, Clock, Film, MoreHorizontal, Play, Star } from "lucide-react"
import { ActionsMenu } from "@/components/tv/actions-menu"
import { Empty, Logo } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { Card, Pill, RoundButton, SkelBar } from "@/components/gtv"
import { isTv } from "@/lib/device"
import { fmt, useLang, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { mmss } from "@/player/util"
import { openTrailer } from "@/components/TrailerModal"
import { useDetail, type DetailRating } from "@/layouts/hooks/use-detail"
import type { Episode } from "@/lib/types"
import type { Person, Trailer } from "@/lib/meta/types"
import { Awards, TitleArt } from "@/components/tv/title-art"
import { GRail } from "../parts"
import { SourceBadge, SourceChooser } from "../source-ui"

type D = ReturnType<typeof useDetail>
export const chip = "inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-2 px-2.5 text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0"
const DIRECT = ["Director"], CREATE = ["Creator"], WRITE = ["Writer", "Screenplay", "Story", "Novel", "Teleplay"]

/** Details, one composition for movies and shows. Full-bleed hero: the art at full strength, title art, genre links, chips
 *  (year, runtime, age rating, resolution, source-marked ratings), 3 lines of plot, white Play + round Trailer / Watched /
 *  Watchlist / More. Shows: underlined season tabs over episode rows (still, "3. Title", length · air date, plot).
 *  Then About (poster, tagline, full plot, awards, credits + media + details rows), Trailers & extras, Cast & crew, More like this. */
export default function Detail({ id }: { id: string }) {
  const t = useT()
  const { lang } = useLang()
  const D = useDetail(id)
  const ready = useCatalog((s) => s.status === "ready")
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

  const day = { year: "numeric", month: "short", day: "numeric" } as const
  const names = (type: "language" | "region", codes: string[]) => codes.map((c) => { try { const n = new Intl.DisplayNames([lang], { type }).of(c); return n && n !== c ? n : c } catch { return c } }).join(", ")
  const src = D.alternatives.find((a) => a.item.id === D.selected?.id)?.source
  const gb = stream.size ? `${fmt.number(Math.round(stream.size / 1e8) / 10)} GB` : ""
  const audio = [stream.audio, stream.ch, stream.langs?.length ? names("language", stream.langs) : ""].filter(Boolean).join(" · ")
  const cert = D.meta?.cert
  const seen = isSeries ? shown.filter((e) => D.watched(e.item)).length : 0
  const moviePct = !isSeries && D.selected ? D.pct(D.selected) : 0

  // credits by their raw (English) TMDB role; tapping a name opens the person
  const crewBy = (roles: string[]) => (D.meta?.crew ?? []).filter((c) => (c.role ?? "").split(", ").some((r) => roles.includes(r)))
  const directors = crewBy(isSeries ? CREATE : DIRECT)
  const leads = directors.length ? directors : D.directors.map((name) => ({ name }) as Person)
  const people = (ps: Person[]) => ps.length > 0 && ps.slice(0, 3).map((p, i) => (
    <Fragment key={p.name}>{i > 0 && ", "}<button data-nav onClick={() => D.openPerson(p)} className="rounded underline-offset-4 hover:underline">{p.name}</button></Fragment>
  ))
  const credits: [string, ReactNode][] = [
    [t(isSeries ? "gtv.detail.createdBy" : "gtv.detail.directedBy"), people(leads)],
    [t("gtv.detail.writtenBy"), people(crewBy(WRITE))],
    [t("gtv.detail.starring"), D.cast.length ? people(D.cast) : D.castText && <span className="line-clamp-2">{D.castText}</span>],
    [t(isSeries ? "gtv.detail.network" : "gtv.detail.studio"), D.studios.slice(0, 2).join(", ")],
    [t("gtv.detail.video"), [stream.res, stream.video].filter(Boolean).join(" · ")],
    [t("gtv.detail.audio"), audio],
    [t("gtv.detail.format"), [stream.box, gb].filter(Boolean).join(" · ")],
  ]
  const about: [string, ReactNode][] = [
    [t("gtv.detail.original"), D.original],
    [t("gtv.detail.status"), D.status],
    [t("gtv.detail.language"), D.languages.length ? names("language", D.languages) : ""],
    [t("gtv.detail.country"), D.countries.length ? names("region", D.countries) : ""],
    [t("gtv.detail.category"), item.group && <button data-nav onClick={() => D.openCategory()} className="rounded underline-offset-4 hover:underline">{item.group}</button>],
    [t("gtv.detail.source"), src?.name],
    [t("gtv.detail.added"), stream.added ? fmt.date(new Date(stream.added * 1000), day) : ""],
  ]
  const menu = D.marks.slice(1) // marks[0] (watched) has its own button

  return (
    <div className="h-full overflow-y-auto bg-background pb-[max(2.5rem,var(--safe-b))]">
      {/* full-bleed hero: the art at full strength, a scrim on the reading side, title art, chips, plot, actions */}
      <Hero art={backdrops} mobileArt={poster?.logo ? [poster.logo] : undefined} tall onBack={D.back}>
          <TitleArt title={D.title} logo={D.logo} className="text-4xl font-semibold tracking-tight md:text-6xl" />

          {D.genres.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center text-base text-foreground/80">
              {D.genres.map((g, i) => <Fragment key={g}>{i > 0 && <span aria-hidden className="mx-2 opacity-60">·</span>}<button data-nav onClick={() => D.openGenre(g)} className="rounded underline-offset-4 hover:text-foreground hover:underline">{g}</button></Fragment>)}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SourceBadge item={D.selected ?? item} className="text-sm" />
            {D.chips.map((c) => <span key={c} className={chip}>{c === cert ? <Film /> : /^\d{4}$/.test(c) ? <Calendar /> : <Clock />}{c}</span>)}
            {isSeries && seasons.length > 0 && <span className={chip}>{fmt.plural("gtv.detail.seasons", seasons.length)}</span>}
            {stream.res && <span className={chip}>{stream.res}</span>}
            {ratings.map((r) => <span key={r.source} className={chip}><Score r={r} name={D.ratingName(r.source)} /></span>)}
          </div>

          {plot && <p dir="auto" className="mt-4 line-clamp-3 text-base leading-relaxed text-foreground/85 md:text-lg">{plot}</p>}
          {loading && !plot && <div role="status" aria-label={t("gtv.detail.loading")} className="mt-4 space-y-3"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div>}

          <div className="-ms-1 mt-5 flex flex-wrap items-center gap-3 p-1">
            {D.resumeAt > 0 ? (
              // in progress: Play asks Resume from 12:34 / Play from beginning (Plex)
              <ActionsMenu
                items={[
                  { label: t("gtv.detail.resumeFrom", { time: mmss(D.resumeAt) }), run: () => D.playMain() },
                  { label: t("gtv.detail.fromStart"), run: () => D.playMain(true) },
                ]}
                trigger={(o) => <Pill variant="primary" data-autofocus="" aria-haspopup="menu" aria-expanded={o.open} onClick={o.toggle} disabled={!D.canPlay}><Play className="fill-current" />{mainLabel}</Pill>}
              />
            ) : <Pill variant="primary" data-autofocus="" onClick={() => D.playMain()} disabled={!D.canPlay}><Play className="fill-current" />{mainLabel}</Pill>}
            {D.trailer && <RoundButton label={t("trailer.button")} onClick={() => openTrailer(D.trailer!)}><Clapperboard /></RoundButton>}
            <RoundButton label={t(D.allWatched ? "hooks.detail.markUnwatched" : "hooks.detail.markWatched")} aria-pressed={D.allWatched} onClick={D.toggleWatched} className={D.allWatched ? "bg-[var(--plex)] text-[var(--plex-fg)]" : undefined}><Check /></RoundButton>
            <RoundButton label={fav ? t("gtv.home.removeWatchlist") : t("gtv.home.addWatchlist")} aria-pressed={fav} active={fav} onClick={toggleFav}>{fav ? <BookmarkCheck /> : <Bookmark />}</RoundButton>
            {menu.length > 0 && <ActionsMenu items={menu} trigger={(o) => <RoundButton label={t("common.moreOptions")} active={o.open} aria-haspopup="menu" aria-expanded={o.open} onClick={o.toggle}><MoreHorizontal /></RoundButton>} />}
          </div>
          {moviePct > 0 && moviePct < 95 && <div dir="ltr" className="mt-3 h-1 w-64 max-w-full overflow-hidden rounded-full bg-foreground/15"><div className="h-full bg-[var(--plex)]" style={{ width: `${moviePct}%` }} /></div>}
          <SourceChooser className="mt-3" alternatives={D.alternatives} selected={D.selected} onSelect={D.selectSource} />
          {D.error && <p role="alert" className="mt-3 text-destructive">{D.error}</p>}
      </Hero>

      <div className="px-[var(--gx)]">
        {isSeries && (
          <section className="mt-4">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-foreground/10">
              {seasons.length > 1 ? (
                <div data-nav-group="memory" role="tablist" aria-label={t("gtv.detail.episodes")} className="no-scrollbar -mb-px flex gap-6 overflow-x-auto">
                  {seasons.map((x) => (
                    <button key={x} data-nav role="tab" aria-selected={x === season} onClick={() => D.setSeason(x)} className={cn("shrink-0 rounded-t-md border-b-2 px-1 pb-2 pt-1 text-lg", x === season ? "border-[var(--plex)] font-medium text-foreground" : "border-transparent text-muted-foreground")}>
                      {t("gtv.detail.season", { n: x })}
                    </button>
                  ))}
                </div>
              ) : <h2 className="pb-2 text-[1.4rem] font-normal">{t("gtv.detail.episodes")}</h2>}
              {shown.length > 0 && <p className="pb-2 text-sm text-muted-foreground">{t("gtv.detail.seasonSeen", { seen: fmt.number(seen), total: fmt.number(shown.length) })}</p>}
            </div>
            {season !== null
              ? <div data-nav-group className="mt-3 flex flex-col gap-1">{shown.map((e) => <EpisodeRow key={e.id} e={e} D={D} />)}</div>
              : loading
                ? <div aria-hidden className="mt-3 flex flex-col gap-1">{Array.from({ length: 4 }, (_, i) => <div key={i} className="flex gap-4 p-2 md:gap-6 md:p-3"><div className="skel aspect-video w-36 shrink-0 rounded-lg sm:w-48 md:w-64" /><div className="flex-1 space-y-3 py-1"><SkelBar className="w-1/2" /><SkelBar className="w-1/4" /><SkelBar className="w-full" /></div></div>)}</div>
                : <p className="mt-3 text-base text-muted-foreground">{t("gtv.detail.noEpisodes")}</p>}
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-4 text-[1.4rem] font-normal">{t("gtv.detail.about")}</h2>
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
            {poster && (
              <div className="w-48 max-md:hidden">
                <Logo item={poster} className="aspect-[2/3] w-full rounded-xl object-cover shadow-xl" />
              </div>
            )}
            <div className="min-w-0 max-w-2xl">
              {D.tagline && <p dir="auto" className="mb-2 text-lg font-semibold">{D.tagline}</p>}
              {plot ? <p dir="auto" className="text-base leading-relaxed text-foreground/85 md:text-lg">{plot}</p> : loading && <div className="space-y-3"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div>}
              <Awards text={D.awards} className="mt-4" />
              {D.next && <p className="mt-3 text-base text-foreground/80">{t("gtv.detail.next", { code: t("pages.episode.code", { s: D.next.s, e: D.next.e }), date: fmt.date(new Date(`${D.next.air}T12:00:00`), day) })}</p>}
            </div>
            <Rows rows={[...credits, ...about]} className="content-start md:col-span-2 lg:col-span-1" />
          </div>
        </section>
        {D.trailers.length > 0 && <div className="mt-10"><GRail title={t("gtv.detail.trailers")}>{D.trailers.map((v) => <TrailerTile key={v.key} v={v} />)}</GRail></div>}
        {D.cast.length + D.crew.length > 0 && (
          <div className="mt-8">
            <GRail title={t("gtv.detail.cast")}>
              {[...D.cast.slice(0, 20), ...D.crew].map((c, i) => <PersonTile key={`${c.name}:${i}`} p={c} onOpen={() => D.openPerson(c)} />)}
            </GRail>
          </div>
        )}
        {similar.length > 0 && <div className="mt-8"><GRail title={t("gtv.detail.similar")}>{similar.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</GRail></div>}
      </div>
    </div>
  )
}

/** Hero shared by the show/movie and episode pages. md and up: full-bleed art at full strength, a scrim on the reading side, content at the bottom,
 *  `aside` on the end side. Phones: an image across the top (`mobileArt` if given, else `art`), fading into the page, content below it
 *  (a wide image behind a tall phone screen was cropped to a strip and covered by the text): `tall` = a portrait poster at 4:5 (most of the
 *  screen), else a 16:9 image shown whole. Back on both (not on TV). */
export function Hero({ art, mobileArt, tall, onBack, aside, children }: { art: string[]; mobileArt?: string[]; tall?: boolean; onBack: () => void; aside?: ReactNode; children: ReactNode }) {
  const t = useT()
  const phone = mobileArt?.length ? mobileArt : art
  const ph = { "--ph": tall && mobileArt?.length ? "min(125vw,72vh)" : "min(56.25vw,60vh)" } as CSSProperties // phone image height
  return (
    <section style={ph} className="relative flex flex-col justify-end px-[var(--gx)] pb-8 pt-[calc(var(--ph)_-_3rem)] md:min-h-[80vh] md:pt-[max(6rem,var(--safe-t))]">
      {art.length > 0 && <Backdrop srcs={art} className="absolute inset-0 max-md:hidden" />}
      {phone.length > 0 && <Backdrop srcs={phone} className="absolute inset-x-0 top-0 h-[var(--ph)] md:hidden" />}
      <div aria-hidden className="gtv-detail-scrim pointer-events-none absolute inset-0 max-md:hidden" />
      <div aria-hidden className="gtv-hero-fade-b pointer-events-none absolute inset-x-0 bottom-0 h-1/3 max-md:hidden" />
      <div aria-hidden className="gtv-hero-fade-b pointer-events-none absolute inset-x-0 top-[calc(var(--ph)_*_0.55)] h-[calc(var(--ph)_*_0.45_+_1px)] md:hidden" />
      {!isTv && <div className="absolute start-[var(--gx)] top-[max(1.5rem,var(--safe-t))]"><RoundButton label={t("gtv.back")} onClick={onBack}><ArrowLeft className="rtl-flip" /></RoundButton></div>}
      <div className="relative flex items-end justify-between gap-10">
        <div className="m-rise min-w-0 max-w-2xl flex-1">{children}</div>
        {aside && <div className="m-rise hidden shrink-0 md:block">{aside}</div>}
      </div>
    </section>
  )
}

/** A rating with its source's mark (IMDb / TMDB badge, Rotten Tomatoes fresh or rotten dot, Metascore box, else a star). */
export function Score({ r, name }: { r: DetailRating; name: string }) {
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

/** Plex-style episode row: still (watched check, progress) then "3. Title", length · air date, two lines of plot. */
function EpisodeRow({ e, D }: { e: Episode; D: D }) {
  const t = useT()
  const meta = D.epMeta(e)
  const seen = D.watched(e.item)
  const pct = D.pct(e.item)
  const current = D.episodes[D.resumeIdx]?.id === e.id
  const plot = e.item.plot || meta?.plot
  const sub = [D.epDur(e.dur), meta?.air && fmt.date(new Date(`${meta.air}T12:00:00`), { year: "numeric", month: "short", day: "numeric" })].filter(Boolean).join(" · ")
  return (
    <button data-nav onClick={() => D.openEpisode(e)} aria-current={current ? "true" : undefined} className="gtv-ep flex w-full items-start gap-4 rounded-2xl p-2 text-start md:gap-6 md:p-3">
      <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-48 md:w-64">
        {e.item.logo ? <img src={e.item.logo} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-3xl font-semibold text-muted-foreground">{fmt.number(e.num)}</div>}
        {seen && <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-black/70 text-white"><Check className="size-4" /></span>}
        {pct > 0 && !seen && <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/30"><div className="h-full bg-[var(--plex)]" style={{ width: `${pct}%` }} /></div>}
      </div>
      <div className="min-w-0 flex-1 py-1">
        {current && !seen && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--plex)]">{t(D.resuming ? "gtv.detail.continueEpisode" : "gtv.detail.upNext")}</div>}
        <div dir="auto" className="line-clamp-1 text-lg font-medium md:text-xl"><bdi className="text-muted-foreground">{fmt.number(e.num)}.</bdi> {e.title}</div>
        {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
        {plot && <p dir="auto" className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground/75 md:text-base">{plot}</p>}
      </div>
    </button>
  )
}

/** Plex-style label / value rows (label column muted); rows with an empty value are dropped. */
export function Rows({ rows, className }: { rows: [string, ReactNode][]; className?: string }) {
  const r = rows.filter(([, v]) => v)
  if (!r.length) return null
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-base", className)}>
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
export function PersonTile({ p, onOpen }: { p: Person; onOpen: () => void }) {
  return (
    <button data-nav onClick={onOpen} className="flex w-28 shrink-0 flex-col items-center rounded-2xl p-1 text-center">
      {p.photo ? <img src={p.photo} alt="" loading="lazy" decoding="async" className="size-24 rounded-full bg-surface-2 object-cover" /> : <div className="grid size-24 place-items-center rounded-full bg-surface-2 text-2xl font-medium">{p.name.slice(0, 1)}</div>}
      <div dir="auto" className="mt-2 w-full truncate text-sm">{p.name}</div>
      {p.role && <div dir="auto" className="w-full truncate text-xs text-muted-foreground">{p.role}</div>}
    </button>
  )
}
