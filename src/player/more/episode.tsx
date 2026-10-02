import { useEffect, useRef } from "react"
import { Info, Star } from "lucide-react"
import { Card, Pill, SkelGrid } from "@/components/gtv"
import { useDetail } from "@/layouts/hooks/use-detail"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import type { Item } from "@/lib/types"
import type { MoreActions } from "./actions"
import { useGuard, useSeriesOf } from "./hooks"
import { CastRail, Chip, Plot, Ratings, Section, SimilarRail } from "./parts"

/** Episode of a series: episodes of the current season (current marked, progress bars, season picker), series overview, cast, more like this. */
export function EpisodeMore({ item, act }: { item: Item; act: MoreActions }) {
  const t = useT()
  const series = useSeriesOf(item)
  const D = useDetail(series?.id ?? "")
  const guard = useGuard()
  const seasonSet = useRef(false)
  const sid = series?.id ?? item.id
  const isFav = useApp((s) => !!s.profileId && !!s.data[s.profileId]?.favs.includes(sid))
  const toggleFav = useApp((s) => s.toggleFav)
  const cur = D.episodes.find((e) => e.item.id === item.id)

  // open on the season being watched, with the current episode in view
  useEffect(() => {
    if (cur && !seasonSet.current) { seasonSet.current = true; if (D.season !== cur.season) D.setSeason(cur.season) }
  }, [cur, D.season]) // eslint-disable-line react-hooks/exhaustive-deps

  const plot = D.plot || series?.plot
  const queue = D.episodes.map((e) => e.item)
  return (
    <>
      <Section title={t("player.more.nowPlaying")}>
        <div dir="auto" className="text-xl font-medium">{cur ? `${t("player.epShort", { s: cur.season, e: cur.num })}  ·  ${cur.title}` : item.name}</div>
        {item.plot && <p dir="auto" className="mt-2 max-w-3xl text-base leading-relaxed text-foreground/85">{item.plot}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <Pill data-autofocus="" onClick={() => toggleFav(sid)}><Star className={isFav ? "fill-yellow-400 text-yellow-400" : ""} />{t(isFav ? "player.more.removeFav" : "player.more.addFav")}</Pill>
          <Pill onClick={() => act.details(sid)}><Info />{t("player.more.details")}</Pill>
        </div>
      </Section>

      {D.episodes.length > 0 ? (
        <Section title={t("player.more.episodes")}>
          {D.seasons.length > 1 && (
            <div data-nav-group className="no-scrollbar mb-2 flex gap-2 overflow-x-auto py-1">
              {D.seasons.map((s) => <Pill key={s} aria-pressed={s === D.season} variant={s === D.season ? "primary" : "tonal"} onClick={() => D.setSeason(s)}>{t("player.more.season", { n: s })}</Pill>)}
            </div>
          )}
          <div data-nav-group className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]">
              {D.shown.map((e) => (
                <Card key={e.id} item={e.item} variant="wide" fluid pct={D.pct(e.item)} className={e.item.id === item.id ? "pl-cur" : ""} sub={e.item.id === item.id ? `${t("player.more.playing")}  ·  ${D.epLabel(e)}` : D.epLabel(e)} onOpen={() => e.item.id === item.id ? act.close() : act.play(e.item, queue)} />
              ))}
          </div>
        </Section>
      ) : series && !D.error ? <SkelGrid variant="wide" n={6} /> : null}

      {(plot || D.loading) && (
        <Section title={t("player.more.overview")}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {D.chips.map((c) => <Chip key={c}><bdi>{c}</bdi></Chip>)}
            <Ratings ratings={D.ratings} name={D.ratingName} />
            {D.genres.map((g) => <Chip key={g}>{g}</Chip>)}
          </div>
          <Plot text={plot} loading={D.loading} />
        </Section>
      )}
      <CastRail cast={D.cast} loading={D.loading} onOpen={act.person} />
      <SimilarRail items={D.similar} loading={D.loading} onOpen={(i) => guard(i, () => act.details(i.id))} />
    </>
  )
}
