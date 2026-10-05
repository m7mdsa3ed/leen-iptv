import { Calendar, Check, ChevronLeft, ChevronRight, Clock, Play } from "lucide-react"
import { ActionsMenu } from "@/components/tv/actions-menu"
import { Empty } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { Pill, RoundButton } from "@/components/gtv"
import { TitleArt } from "@/components/tv/title-art"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { mmss } from "@/player/util"
import { useEpisode } from "@/layouts/hooks/use-episode"
import type { Episode } from "@/lib/types"
import { GRail } from "../parts"
import { Hero, PersonTile, Rows, Score, chip } from "./detail"

type D = ReturnType<typeof useEpisode>["D"]

/** One episode, in the show page's design: full-bleed hero (the show's art; the episode still framed on the end side) with the show's title art
 *  (back to the show), S1 · E3, episode title, chips (air date, runtime, TMDB rating), plot, white Play / Resume + round
 *  Watched / Previous / Next. Then the season's episodes, About (full plot, directed / written by), Guest stars. */
export default function EpisodePage({ id }: { id: string }) {
  const t = useT()
  const E = useEpisode(id)
  const { D, episode } = E
  const ready = useCatalog((s) => s.status === "ready")
  if (!D.item) return <Empty><div className="flex flex-col items-center gap-4">{ready ? t("common.notFound") : t("common.loading")}{ready && <Pill variant="primary" data-autofocus="" onClick={D.back}>{t("common.back")}</Pill>}</div></Empty>
  // never a page with nothing focusable: when the episode cannot be found (or the show's info failed) there is a Back button
  if (!episode) return <Empty><div className="flex flex-col items-center gap-4">{E.missing || D.error ? t("pages.episode.missing") : t("common.loading")}{(E.missing || D.error) && <Pill variant="primary" data-autofocus="" onClick={D.back}>{t("common.back")}</Pill>}</div></Empty>
  // the hero is the show's backdrop art (wide, sharp); the episode still (TMDB w780 or a panel thumbnail) is too small to fill the screen,
  // so it is framed on the side instead, unless it is just the show's poster standing in for a missing still
  const still = E.still && E.still !== D.item.logo && E.still !== D.poster?.logo ? E.still : undefined
  const art = D.backdrops.length ? D.backdrops : still ? [still] : []
  const label = t(E.resuming ? "pages.episode.resume" : "pages.episode.play")
  const rows: [string, string][] = [[t("pages.episode.directedBy"), E.directors.join(", ")], [t("pages.episode.writtenBy"), E.writers.join(", ")]]

  return (
    <div className="h-full overflow-y-auto bg-background pb-[max(2.5rem,var(--safe-b))]">
      <Hero art={art} mobileArt={still ? [still] : undefined} onBack={D.back} aside={still && (
        <button onClick={() => E.play()} aria-label={label} className="relative block aspect-video w-[22rem] overflow-hidden rounded-2xl bg-surface-2 shadow-2xl ring-1 ring-white/15 lg:w-[30rem]">
          <img src={still} alt="" decoding="async" className="size-full object-cover" />
          <span className="absolute inset-0 m-auto grid size-14 place-items-center rounded-full bg-black/55 text-white"><Play className="size-6 fill-current" /></span>
          {E.pct > 0 && E.pct < 95 && <span dir="ltr" className="absolute inset-x-0 bottom-0 block h-1.5 bg-white/30"><span className="block h-full bg-[var(--plex)]" style={{ width: `${E.pct}%` }} /></span>}
        </button>
      )}>
        <button data-nav onClick={D.back} aria-label={t("pages.episode.series", { name: D.title })} className="block rounded-lg text-start [&_img]:max-h-16">
          <TitleArt as="h2" title={D.title} logo={D.logo} className="text-xl font-semibold text-foreground/85 md:text-2xl" />
        </button>
        <div className="mt-4 text-sm font-semibold uppercase tracking-wide text-[var(--plex)]">{E.code}</div>
        <h1 dir="auto" className="mt-1 text-3xl font-semibold tracking-tight md:text-5xl">{E.title}</h1>

        {(E.air || E.runtime || E.rating) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {E.air && <span className={chip}><Calendar /><bdi>{E.air}</bdi></span>}
            {E.runtime && <span className={chip}><Clock />{E.runtime}</span>}
            {E.rating && <span className={chip}><Score r={{ source: "TMDB", value: E.rating }} name="TMDB" /></span>}
          </div>
        )}
        {E.plot && <p dir="auto" className="mt-4 line-clamp-3 text-base leading-relaxed text-foreground/85 md:text-lg">{E.plot}</p>}

        <div className="-ms-1 mt-5 flex flex-wrap items-center gap-3 p-1">
          {E.resumeAt > 0 ? (
            <ActionsMenu
              items={[
                { label: t("gtv.detail.resumeFrom", { time: mmss(E.resumeAt) }), run: () => E.play() },
                { label: t("gtv.detail.fromStart"), run: () => E.play(true) },
              ]}
              trigger={(o) => <Pill variant="primary" data-autofocus="" aria-haspopup="menu" aria-expanded={o.open} onClick={o.toggle}><Play className="fill-current" />{t("pages.episode.resume")}</Pill>}
            />
          ) : <Pill variant="primary" data-autofocus="" onClick={() => E.play()}><Play className="fill-current" />{label}</Pill>}
          <RoundButton label={t(E.watched ? "hooks.detail.markUnwatched" : "hooks.detail.markWatched")} aria-pressed={E.watched} onClick={E.toggleWatched} className={E.watched ? "bg-[var(--plex)] text-[var(--plex-fg)]" : undefined}><Check /></RoundButton>
          {E.prev && <RoundButton label={t("pages.episode.prev")} onClick={() => E.openEp(E.prev!)}><ChevronLeft className="rtl-flip" /></RoundButton>}
          {E.next && <RoundButton label={t("pages.episode.next")} onClick={() => E.openEp(E.next!)}><ChevronRight className="rtl-flip" /></RoundButton>}
        </div>
        {E.pct > 0 && E.pct < 95 && <div dir="ltr" className="mt-3 h-1 w-64 max-w-full overflow-hidden rounded-full bg-foreground/15"><div className="h-full bg-[var(--plex)]" style={{ width: `${E.pct}%` }} /></div>}
      </Hero>

      <div className="px-[var(--gx)]">
        {D.shown.length > 1 && (
          <div className="mt-4">
            <GRail title={t("gtv.detail.season", { n: episode.season })}>
              {D.shown.map((e) => <EpTile key={e.id} e={e} D={D} current={e.id === episode.id} onOpen={() => E.openEp(e)} />)}
            </GRail>
          </div>
        )}
        {(E.plot || rows.some(([, v]) => v)) && (
          <section className="mt-8">
            <h2 className="mb-4 text-[1.4rem] font-normal">{t("gtv.detail.about")}</h2>
            <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
              {E.plot && <p dir="auto" className="max-w-2xl text-base leading-relaxed text-foreground/85 md:text-lg">{E.plot}</p>}
              <Rows rows={rows} className="content-start" />
            </div>
          </section>
        )}
        {E.guests.length > 0 && (
          <div className="mt-8">
            <GRail title={t("pages.episode.guests")}>
              {E.guests.map((c, i) => <PersonTile key={`${c.name}:${i}`} p={c} onOpen={() => D.openPerson(c)} />)}
            </GRail>
          </div>
        )}
      </div>
    </div>
  )
}

/** Wide episode tile for the season rail: still (watched check, progress), "3. Title", runtime; this episode in the accent colour. */
function EpTile({ e, D, current, onOpen }: { e: Episode; D: D; current: boolean; onOpen: () => void }) {
  const seen = D.watched(e.item)
  const pct = D.pct(e.item)
  const len = D.epDur(e.dur)
  return (
    <button data-nav data-card aria-current={current ? "true" : undefined} onClick={onOpen} className="block w-64 shrink-0 text-start">
      <div data-tilewrap className="relative rounded-2xl">
        <div data-tile className="relative aspect-video overflow-hidden rounded-[inherit] bg-surface">
          {e.item.logo ? <img src={e.item.logo} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-3xl font-semibold text-muted-foreground">{fmt.number(e.num)}</div>}
          {seen && <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-black/70 text-white"><Check className="size-4" /></span>}
          {pct > 0 && !seen && <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/30"><div className="h-full bg-[var(--plex)]" style={{ width: `${pct}%` }} /></div>}
        </div>
        <span data-ring aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" />
      </div>
      <div className="card-info mt-2 px-1">
        <div dir="auto" className={cn("truncate text-base", current ? "font-semibold text-[var(--plex)]" : "text-foreground")}><bdi className="text-muted-foreground">{fmt.number(e.num)}.</bdi> {e.title}</div>
        {len && <div className="truncate text-sm text-muted-foreground">{len}</div>}
      </div>
    </button>
  )
}
