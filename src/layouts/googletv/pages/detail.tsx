import { Backdrop } from "@/components/Backdrop"
import { Fragment, useState, type ReactNode } from "react"
import { ArrowLeft, Check, Clapperboard, MoreHorizontal, Play, Plus } from "lucide-react"
import { ActionsMenu } from "@/components/tv/actions-menu"
import { Logo } from "@/components/tv/ui"
import { Card, Pill, RoundButton, SkelBar } from "@/components/gtv"
import { isTv } from "@/lib/device"
import { fmt, useLang, useT } from "@/lib/i18n"
import { openTrailer } from "@/components/TrailerModal"
import { useDetail } from "@/layouts/hooks/use-detail"
import type { Episode } from "@/lib/types"
import type { Person } from "@/lib/meta/types"
import { Awards, TitleArt } from "@/components/tv/title-art"
import { GRail } from "../parts"
import { SourceBadge, SourceChooser } from "../source-ui"

const chip = "rounded-full bg-surface-2 px-3 py-1 text-sm text-foreground/80"

/** Google TV details: full-bleed backdrops, poster left (title art, tagline, facts, ratings, plot, Watch + watchlist), then Episodes / Cast / Crew / Details cards (about, this copy, ratings) / More like this.
 *  Shows: the Watch button names the episode it will play, seasons are one-press pills with a watched count, episodes are a vertical list
 *  (still, number + title, duration · air date, two lines of plot) that opens the episode page. */
export default function Detail({ id }: { id: string }) {
  const t = useT()
  const { lang } = useLang()
  const D = useDetail(id)
  const [more, setMore] = useState(false) // full plot
  const { item, isSeries, loading, plot, chips, ratings, poster, backdrops, seasons, season, setSeason, shown, pct, fav, toggleFav, similar, open, stream } = D
  const re = isSeries ? D.episodes[D.resumeIdx] : undefined
  const rp = item && (isSeries ? re?.item : item)
  const pr = rp ? D.progress(rp) : undefined
  const left = D.resuming && pr && pr.dur > pr.pos ? Math.max(1, Math.ceil((pr.dur - pr.pos) / 60)) : 0
  const code = re ? t("pages.episode.code", { s: re.season, e: re.num }) : ""
  const mainLabel = isSeries && re
    ? [t(D.resuming ? "gtv.detail.resumeEp" : "gtv.detail.playEp", { code }), left ? fmt.plural("gtv.minLeft", left) : ""].filter(Boolean).join(" · ")
    : left ? fmt.plural("gtv.detail.resumeLeft", left) : D.resuming ? t("gtv.detail.resume") : t("gtv.detail.watch")
  const seen = shown.filter((e) => D.watched(e.item)).length
  if (!item) return null
  const day = { year: "numeric", month: "short", day: "numeric" } as const
  const names = (type: "language" | "region", codes: string[]) => codes.map((c) => { try { const n = new Intl.DisplayNames([lang], { type }).of(c); return n && n !== c ? n : c } catch { return c } }).join(", ")
  const src = D.alternatives.find((a) => a.item.id === D.selected?.id)?.source
  const gb = stream.size ? `${fmt.number(Math.round(stream.size / 1e8) / 10)} GB` : ""
  const audio = [stream.audio, stream.ch, stream.langs?.length ? names("language", stream.langs) : ""].filter(Boolean).join(" · ")
  const about: [string, ReactNode][] = [
    [t("gtv.detail.original"), D.original],
    [t("gtv.detail.status"), D.status],
    [t("gtv.detail.language"), D.languages.length ? names("language", D.languages) : ""],
    [t("gtv.detail.country"), D.countries.length ? names("region", D.countries) : ""],
    [t(isSeries ? "gtv.detail.network" : "gtv.detail.studio"), D.studios.join(", ")],
    [t("gtv.detail.category"), item.group && <button data-nav onClick={() => D.openCategory()} className="rounded-full px-2 text-start underline-offset-4 hover:underline">{item.group}</button>],
    [t("gtv.detail.castShort"), !D.cast.length && D.castText ? <span dir="auto" className="line-clamp-2">{D.castText}</span> : ""],
  ]
  const copy: [string, ReactNode][] = [
    [t("gtv.detail.source"), src?.name],
    [t("gtv.detail.quality"), [stream.res, stream.video].filter(Boolean).join(" · ")],
    [t("gtv.detail.audio"), audio],
    [t("gtv.detail.format"), [stream.box, gb].filter(Boolean).join(" · ")],
    [t("gtv.detail.added"), stream.added ? fmt.date(new Date(stream.added * 1000), day) : ""],
  ]
  const rated: [string, ReactNode][] = ratings.map((r) => [D.ratingName(r.source), `${r.value}${r.votes ? ` (${r.votes})` : ""}`])
  return (
    <div className="relative h-full bg-background">
      {backdrops.length > 0 && <Backdrop srcs={backdrops} className="absolute inset-0 opacity-60" />}
      <div aria-hidden className="gtv-hero-fade pointer-events-none absolute inset-0" />
      <div aria-hidden className="gtv-hero-fade-b pointer-events-none absolute inset-x-0 bottom-0 h-1/2" />
      <div className="relative h-full overflow-y-auto px-[var(--gx)] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        {!isTv && <RoundButton label={t("gtv.back")} onClick={D.back}><ArrowLeft className="rtl-flip" /></RoundButton>}
        <div className="mt-6 flex flex-col gap-6 md:mt-8 md:flex-row md:gap-10">
          <Logo item={poster!} className="aspect-[2/3] w-36 shrink-0 self-start rounded-2xl object-cover shadow-2xl md:w-60" />
          <div className="min-w-0 md:flex-1">
            <TitleArt title={D.title} logo={D.logo} className="text-4xl font-medium tracking-tight md:text-5xl" />
            {D.tagline && <p dir="auto" className="mt-2 text-lg italic text-foreground/70">{D.tagline}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SourceBadge item={D.selected ?? item} className="text-sm" />
              {chips.map((m) => <span key={m} className="text-base text-foreground/80">{m}</span>)}
              {isSeries && seasons.length > 0 && <span className="text-base text-foreground/80">{fmt.plural("gtv.detail.seasons", seasons.length)}</span>}
              {stream.res && <span className="rounded-md bg-foreground/15 px-2 py-0.5 text-sm font-medium">{stream.res}</span>}
              {ratings.map((r) => <span key={r.source} className="rounded-md border border-foreground/40 px-2 py-0.5 text-sm">{D.ratingName(r.source)} <b>{r.value}</b></span>)}
            </div>
            {D.genres.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{D.genres.map((g) => <button key={g} data-nav onClick={() => D.openGenre(g)} className={chip}>{g}</button>)}</div>}
            {plot && (plot.length > 240
              ? <button data-nav onClick={() => setMore(!more)} aria-expanded={more} className="mt-4 block max-w-2xl rounded-xl text-start"><p dir="auto" className={`text-base text-foreground/80 md:text-lg ${more ? "" : "line-clamp-3"}`}>{plot}</p><span className="text-sm text-accent-blue">{t(more ? "gtv.detail.less" : "gtv.detail.more")}</span></button>
              : <p dir="auto" className="mt-4 max-w-2xl text-base text-foreground/80 md:text-lg">{plot}</p>)}
            <Awards text={D.awards} className="mt-3" />
            {loading && !plot && <div role="status" aria-label={t("gtv.detail.loading")} className="mt-4 max-w-2xl space-y-3"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div>}
            {D.next && <p className="mt-3 text-base text-foreground/80">{t("gtv.detail.next", { code: t("pages.episode.code", { s: D.next.s, e: D.next.e }), date: fmt.date(new Date(`${D.next.air}T12:00:00`), day) })}</p>}
            <SourceChooser alternatives={D.alternatives} selected={D.selected} onSelect={D.selectSource} />
            {D.error && <p className="mt-3 text-destructive">{D.error}</p>}
            <div className="-ms-1 mt-6 flex flex-wrap items-center gap-3 p-1">
              <Pill variant="primary" data-autofocus="" onClick={D.playMain} disabled={!D.canPlay}><Play className="fill-current" />{mainLabel}</Pill>
              <RoundButton label={fav ? t("gtv.home.removeWatchlist") : t("gtv.home.addWatchlist")} active={fav} onClick={toggleFav}>{fav ? <Check /> : <Plus />}</RoundButton>
              {D.trailer && <Pill onClick={() => openTrailer(D.trailer!)}><Clapperboard />{t("trailer.button")}</Pill>}
              <ActionsMenu items={D.marks} trigger={(o) => <RoundButton label={t("common.moreOptions")} active={o.open} aria-haspopup="menu" aria-expanded={o.open} onClick={o.toggle}><MoreHorizontal /></RoundButton>} />
            </div>
            {isSeries && re && <p dir="auto" className="mt-2 truncate text-sm text-muted-foreground">{re.title}</p>}
          </div>
        </div>
        {isSeries && (
          <section className="mt-8">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="text-[1.4rem] font-normal">{t("gtv.detail.episodes")}</h2>
              {shown.length > 0 && <span className="text-sm text-muted-foreground">{t("gtv.detail.seasonSeen", { seen: fmt.number(seen), total: fmt.number(shown.length) })}</span>}
            </div>
            {seasons.length > 1 && (
              <div data-nav-group="memory" role="tablist" aria-label={t("gtv.detail.episodes")} className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto p-1">
                {seasons.map((x) => <Pill key={x} role="tab" aria-selected={x === season} variant={x === season ? "primary" : "tonal"} onClick={() => setSeason(x)}>{t("gtv.detail.season", { n: x })}</Pill>)}
              </div>
            )}
            {season !== null ? (
              <div data-nav-group className="-mx-2 mt-3 flex flex-col gap-1 [--s:1.015]">
                {shown.map((e) => <EpisodeRow key={e.id} e={e} D={D} pct={pct(e.item)} />)}
              </div>
            ) : loading ? (
              <div aria-hidden className="mt-4 space-y-4">{Array.from({ length: 3 }, (_, i) => <div key={i} className="flex gap-5"><div className="aspect-video w-36 animate-pulse rounded-xl bg-surface-2 md:w-56" /><div className="flex-1 space-y-3 pt-2"><SkelBar className="w-1/2" /><SkelBar className="w-1/4" /><SkelBar className="w-5/6" /></div></div>)}</div>
            ) : <p className="mt-2 text-base text-muted-foreground">{t("gtv.detail.noEpisodes")}</p>}
          </section>
        )}
        {D.cast.length > 0 && <div className="mt-6"><GRail title={t("gtv.detail.cast")}>{D.cast.slice(0, 20).map((c) => <PersonTile key={c.name} p={c} onOpen={() => D.openPerson(c)} />)}</GRail></div>}
        {D.crew.length > 0 && <GRail title={t("gtv.detail.crew")}>{D.crew.map((c) => <PersonTile key={c.name} p={c} onOpen={() => D.openPerson(c)} />)}</GRail>}
        <section className="mt-6">
          <h2 className="mb-3 text-[1.4rem] font-normal">{t("gtv.detail.details")}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Facts title={t("gtv.detail.about")} rows={about} />
            <Facts title={t("gtv.detail.thisCopy")} rows={copy} />
            <Facts title={t("gtv.detail.ratings")} rows={rated} />
          </div>
        </section>
        {similar.length > 0 && <GRail title={t("gtv.detail.similar")}>{similar.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</GRail>}
      </div>
    </div>
  )
}

/** A titled card of label / value rows; rows with an empty value are dropped and an empty card renders nothing. */
function Facts({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  const r = rows.filter(([, v]) => v)
  if (!r.length) return null
  return (
    <div className="rounded-2xl bg-surface-2/70 p-5">
      <h3 className="mb-2 text-base font-medium text-muted-foreground">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-base">
        {r.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd dir="auto" className="min-w-0 break-words">{v}</dd></Fragment>)}
      </dl>
    </div>
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

/** One episode: still with progress + watched tick, "E3  Title", duration · air date, two lines of plot. Enter opens the episode page. */
function EpisodeRow({ e, D, pct }: { e: Episode; D: ReturnType<typeof useDetail>; pct: number }) {
  const t = useT()
  const m = D.epMeta(e)
  const seen = D.watched(e.item)
  const sub = [D.epDur(e.dur), m?.air && fmt.date(new Date(`${m.air}T12:00:00`), { year: "numeric", month: "short", day: "numeric" }), seen ? t("hooks.detail.watched") : ""].filter(Boolean).join("  ·  ")
  const plot = e.item.plot || m?.plot
  return (
    <button data-nav onClick={() => D.openEpisode(e)} aria-label={`${t("hooks.detail.ep", { n: e.num })} ${e.title}`} className="gtv-ep flex w-full items-center gap-4 rounded-2xl p-2 text-start md:gap-5">
      <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-surface-2 md:w-56">
        {e.item.logo ? <img src={e.item.logo} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-2xl font-medium text-muted-foreground">{fmt.number(e.num)}</div>}
        {seen && <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white"><Check className="size-4" /></span>}
        {pct > 0 && !seen && <span dir="ltr" className="absolute inset-x-0 bottom-0 block h-1 bg-white/25"><span className="block h-full bg-accent-blue" style={{ width: `${pct}%` }} /></span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <span className="shrink-0 text-base text-muted-foreground">{t("hooks.detail.ep", { n: e.num })}</span>
          <span dir="auto" className="truncate text-lg text-foreground">{e.title}</span>
        </div>
        {sub && <div className="mt-0.5 text-sm text-muted-foreground"><bdi>{sub}</bdi></div>}
        {plot && <p dir="auto" className="mt-1 line-clamp-2 text-base text-foreground/75">{plot}</p>}
      </div>
    </button>
  )
}
