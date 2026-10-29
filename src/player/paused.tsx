import { Art, SkelBar } from "@/components/gtv"
import { useDetail } from "@/layouts/hooks/use-detail"
import { fmt, useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { useSeriesOf } from "./panel"
import { useProgramme } from "./programme"
import { Tag } from "./ui"
import type { P } from "./use-player"
import { describe } from "./util"

/* What a pause puts over the picture: the title's metadata instead of the bare dock head, in a panel that takes the bottom half of
   the screen on the dock's gradient (player.css .pl-paused). Nothing in it is focusable: the controls below keep the D-pad. */

export function PausedInfo({ p }: { p: P }) {
  return p.live ? <LivePaused item={p.item} /> : <VodPaused p={p} />
}

/** Movie / episode: poster, title, facts and ratings, genres, the plot, director and cast. */
function VodPaused({ p }: { p: P }) {
  const t = useT()
  const series = useSeriesOf(p.item)
  const D = useDetail(p.episode ? series?.id ?? "" : p.item.id)
  const { title, sub } = describe(p.item, t)
  const plot = (p.episode && p.item.plot) || D.plot || p.item.plot
  const facts = [...D.chips, ...D.ratings.map((r) => `${D.ratingName(r.source)} ${r.value}`)].filter(Boolean)
  const cast = D.cast.slice(0, 4).map((c) => c.name).join(", ")
  return (
    <div className="pl-paused">
      {(D.poster ?? p.item.logo) && <Poster item={D.poster ?? p.item} />}
      <div className="pl-paused-body">
        <div dir="auto" className="pl-title pl-trunc">{title}</div>
        {sub && <div dir="auto" className="pl-sub pl-trunc">{sub}</div>}
        {(facts.length > 0 || D.genres.length > 0) && (
          <div className="pl-wrap pt-1">
            {facts.map((f) => <Tag key={f}>{f}</Tag>)}
            {D.genres.length > 0 && <span className="pl-meta">{D.genres.join("  ·  ")}</span>}
          </div>
        )}
        {plot ? <p dir="auto" className="pl-text pl-paused-plot">{plot}</p> : D.loading ? <div className="space-y-2 pt-1"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div> : null}
        {(D.directors.length > 0 || cast) && (
          <p dir="auto" className="pl-meta pl-trunc">
            {D.directors.length > 0 && <><span className="text-[var(--pl-fg-3)]">{t("player.more.director")}: </span>{D.directors.join(", ")}</>}
            {D.directors.length > 0 && cast && <span aria-hidden className="text-[var(--pl-fg-3)]">·</span>}
            {cast && <><span className="text-[var(--pl-fg-3)]">{t("player.more.cast")}: </span>{cast}</>}
          </p>
        )}
      </div>
    </div>
  )
}

/** The metadata poster when there is one, else the source logo (the Art frame draws a name tile without either). */
function Poster({ item }: { item: Item }) {
  return (
    <div className="pl-paused-art">
      <Art item={item} variant="poster" className="w-full" />
    </div>
  )
}

/** Live: the channel, then what is on and what follows (short EPG; nothing when the source has no guide). */
function LivePaused({ item }: { item: Item }) {
  const t = useT()
  const { current, next, pct } = useProgramme(item)
  const { title, sub } = describe(item, t)
  return (
    <div className="pl-paused" data-live>
      <div className="pl-paused-body">
        <div dir="auto" className="pl-title pl-trunc">{title}</div>
        {sub && <div dir="auto" className="pl-sub pl-trunc">{sub}</div>}
        {current ? (
          <div className="flex flex-col gap-2 pt-1">
            <div className="pl-meta"><span dir="auto" className="min-w-0 flex-1 pl-trunc text-white">{current.title}</span><span dir="ltr" data-ltr className="shrink-0">{fmt.time(current.start)} - {fmt.time(current.end)}</span></div>
            <span dir="ltr" data-ltr className="pl-track"><span className="pl-fill" style={{ transform: `scaleX(${pct / 100})` }} /></span>
            {current.plot && <p dir="auto" className="pl-text pl-paused-plot">{current.plot}</p>}
          </div>
        ) : <p className="pl-note pt-1">{t("player.noGuide")}</p>}
        {next && (
          <div className="pl-meta pt-2">
            <span className="text-[var(--pl-fg-3)]">{t("player.more.nextProgramme")}: </span>
            <span dir="auto" className="min-w-0 flex-1 pl-trunc">{next.title}</span>
            <span dir="ltr" data-ltr className="shrink-0">{fmt.time(next.start)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
