import { Backdrop } from "@/components/Backdrop"
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Eye, Play, Star } from "lucide-react"
import { Empty } from "@/components/tv/ui"
import { Pill, RoundButton } from "@/components/gtv"
import { isTv } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { useEpisode } from "@/layouts/hooks/use-episode"
import { ActionsMenu } from "@/components/tv/actions-menu"
import { mmss } from "@/player/util"

/** One episode: still, title, plot, air date, Play / Resume, watched toggle, previous / next, guest stars and crew. Shared by every layout. */
export default function EpisodePage({ id }: { id: string }) {
  const t = useT()
  const E = useEpisode(id)
  const { D, episode } = E
  if (!D.item) return null
  if (!episode) return <Empty>{E.missing ? t("pages.episode.missing") : t("common.loading")}</Empty>
  const art = [E.still, ...D.backdrops].filter((x): x is string => !!x)
  return (
    <div className="relative h-full overflow-y-auto bg-background px-[var(--gx)] pb-[max(2.5rem,var(--safe-b))] pt-[max(1.5rem,var(--safe-t))]">
      {art.length > 0 && <Backdrop srcs={art} className="absolute inset-x-0 top-0 h-[34rem] opacity-30" />}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-r rtl:bg-gradient-to-l from-background via-background/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-t from-background via-transparent to-transparent" />
      <div className="relative">
        {!isTv && <RoundButton label={t("common.back")} onClick={D.back}><ArrowLeft className="rtl-flip" /></RoundButton>}
        <div className="mt-6 flex flex-col gap-6 md:mt-10 md:flex-row md:gap-10">
          <div className="relative aspect-video w-full max-w-md shrink-0 self-start overflow-hidden rounded-2xl bg-surface-2 shadow-2xl md:w-[26rem]">
            {E.still && <img src={E.still} alt="" className="size-full object-cover" />}
            {E.pct > 0 && <span dir="ltr" className="absolute inset-x-0 bottom-0 block h-1.5 bg-white/30"><span className="block h-full bg-accent-blue" style={{ width: `${E.pct}%` }} /></span>}
          </div>
          <div className="min-w-0 md:flex-1">
            <button data-nav onClick={D.back} className="rounded-full text-start text-base text-muted-foreground underline-offset-4 hover:underline">{t("pages.episode.series", { name: D.title })}</button>
            <div className="mt-2 text-sm font-semibold tracking-wide text-accent-blue">{E.code}</div>
            <h1 dir="auto" className="mt-1 text-3xl font-medium tracking-tight text-foreground md:text-4xl">{E.title}</h1>
            {(E.chips.length > 0 || E.rating) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {E.chips.map((c) => <span key={c} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-foreground/80"><bdi>{c}</bdi></span>)}
                {E.rating && <span className="inline-flex items-center gap-1 rounded-full bg-accent-blue-container px-3 py-1 text-sm text-foreground"><Star className="size-3.5 fill-current" />TMDB <b>{E.rating}</b></span>}
              </div>
            )}
            {E.plot && <p dir="auto" className="mt-4 max-w-2xl text-base text-foreground/80 md:text-lg">{E.plot}</p>}
            <div className="-ms-1 mt-6 flex flex-wrap items-center gap-3 p-1">
              {E.resumeAt > 0 ? (
                <ActionsMenu
                  items={[
                    { label: t("gtv.detail.resumeFrom", { time: mmss(E.resumeAt) }), run: () => E.play() },
                    { label: t("gtv.detail.fromStart"), run: () => E.play(true) },
                  ]}
                  trigger={(o) => <Pill variant="primary" data-autofocus="" aria-haspopup="menu" aria-expanded={o.open} onClick={o.toggle}><Play className="fill-current" />{t("pages.episode.resume")}</Pill>}
                />
              ) : <Pill variant="primary" data-autofocus="" onClick={() => E.play()}><Play className="fill-current" />{t(E.resuming ? "pages.episode.resume" : "pages.episode.play")}</Pill>}
              <Pill onClick={E.toggleWatched}>{E.watched ? <Check /> : <Eye />}{t(E.watched ? "hooks.detail.markUnwatched" : "hooks.detail.markWatched")}</Pill>
              {E.prev && <Pill onClick={() => E.openEp(E.prev!)}><ChevronLeft className="rtl-flip" />{t("pages.episode.prev")}</Pill>}
              {E.next && <Pill onClick={() => E.openEp(E.next!)}>{t("pages.episode.next")}<ChevronRight className="rtl-flip" /></Pill>}
            </div>
            {(E.directors.length > 0 || E.writers.length > 0) && (
              <dl className="mt-6 grid max-w-2xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-base">
                {E.directors.length > 0 && <><dt className="text-muted-foreground">{t("pages.episode.directedBy")}</dt><dd dir="auto">{E.directors.join(", ")}</dd></>}
                {E.writers.length > 0 && <><dt className="text-muted-foreground">{t("pages.episode.writtenBy")}</dt><dd dir="auto">{E.writers.join(", ")}</dd></>}
              </dl>
            )}
          </div>
        </div>
        {E.guests.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[1.4rem] font-normal">{t("pages.episode.guests")}</h2>
            <div data-nav-group className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
              {E.guests.map((c) => (
                <button key={c.id ?? c.name} data-nav onClick={() => D.openPerson(c)} className="flex w-28 shrink-0 flex-col items-center rounded-2xl p-1 text-center">
                  {c.photo ? <img src={c.photo} alt="" loading="lazy" decoding="async" className="size-24 rounded-full bg-surface-2 object-cover" /> : <div className="grid size-24 place-items-center rounded-full bg-surface-2 text-2xl font-medium">{c.name.slice(0, 1)}</div>}
                  <div dir="auto" className="mt-2 w-full truncate text-sm">{c.name}</div>
                  {c.role && <div dir="auto" className="w-full truncate text-xs text-muted-foreground">{c.role}</div>}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
