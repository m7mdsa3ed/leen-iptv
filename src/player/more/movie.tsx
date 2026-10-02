import { Clapperboard, Info, Star } from "lucide-react"
import { Pill } from "@/components/gtv"
import { useDetail } from "@/layouts/hooks/use-detail"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import type { Item } from "@/lib/types"
import type { MoreActions } from "./actions"
import { useGuard } from "./hooks"
import { CastRail, Chip, Plot, Ratings, Section, SimilarRail } from "./parts"

/** Movie: overview, actions (favorite, trailer, full details), cast, more like this. Works without a metadata provider (Xtream / Plex / Jellyfin data only). */
export function MovieMore({ item, act }: { item: Item; act: MoreActions }) {
  const t = useT()
  const D = useDetail(item.id)
  const guard = useGuard()
  const isFav = useApp((s) => !!s.profileId && !!s.data[s.profileId]?.favs.includes(item.id))
  const toggleFav = useApp((s) => s.toggleFav)
  const plot = D.plot || item.plot
  const year = D.chips[0] || item.year
  const chips = [year, ...D.chips.slice(1)].filter(Boolean) as string[]
  return (
    <>
      <Section title={t("player.more.overview")}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {chips.map((c) => <Chip key={c}><bdi>{c}</bdi></Chip>)}
          <Ratings ratings={D.ratings} name={D.ratingName} />
          {D.genres.map((g) => <Chip key={g}>{g}</Chip>)}
        </div>
        <Plot text={plot} loading={D.loading} />
        {!plot && !D.loading && <p className="text-base text-muted-foreground">{t("player.more.noInfo")}</p>}
        {D.directors.length > 0 && <p dir="auto" className="mt-3 text-base text-foreground/85"><span className="text-muted-foreground">{t("player.more.director")}: </span>{D.directors.join(", ")}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <Pill data-autofocus="" className="pl-btn pl-act" onClick={() => toggleFav(item.id)}><Star className={isFav ? "fill-yellow-400 text-yellow-400" : ""} />{t(isFav ? "player.more.removeFav" : "player.more.addFav")}</Pill>
          {D.trailer && <Pill className="pl-btn pl-act" onClick={() => act.trailer(D.trailer!)}><Clapperboard />{t("player.more.trailer")}</Pill>}
          <Pill className="pl-btn pl-act" onClick={() => act.details(item.id)}><Info />{t("player.more.details")}</Pill>
        </div>
      </Section>
      <CastRail cast={D.cast} loading={D.loading} onOpen={act.person} />
      <SimilarRail items={D.similar} loading={D.loading} onOpen={(i) => guard(i, () => act.play(i, [i]))} />
    </>
  )
}
