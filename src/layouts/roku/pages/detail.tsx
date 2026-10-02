import { Check, Play, Plus } from "lucide-react"
import { Logo, Shell } from "@/components/tv/ui"
import { Pill, SkelBar } from "@/components/gtv"
import { SourceChooser } from "@/components/source/SourceChooser"
import { useT } from "@/lib/i18n"
import { useDetail } from "../../hooks/use-detail"
import { Page } from "../ui"

/** Detail: poster left; title, facts, big Play, plot right; seasons and episodes as a plain list. */
export default function Detail({ id }: { id: string }) {
  const t = useT()
  const D = useDetail(id)
  const { item, isSeries, plot, chips, genres, loading } = D
  if (!item) return null
  return (
    <Shell page="detail" title={item.name}>
      <Page>
        <div className="rk-det">
          {D.backdrop && <img aria-hidden src={D.backdrop} alt="" className="rk-det-bg" />}
          <div className="rk-det-poster"><Logo item={D.poster ?? item} className="size-full object-cover" /></div>
          <div className="relative min-w-0">
            <h2 dir="auto" className="line-clamp-2 text-5xl font-black leading-tight">{item.name}</h2>
            <div dir="auto" className="mt-2 text-xl opacity-80">{[...chips, ...D.ratings.slice(0, 1).map((r) => `${r.source} ${r.value}`), ...genres.slice(0, 2)].join("  ·  ")}</div>
            <div className="mt-5 flex flex-wrap gap-4">
              <button data-nav data-autofocus="" disabled={!D.canPlay} onClick={D.playMain} className="rk-play"><Play className="fill-current" />{D.resumeLabel}</button>
              <Pill onClick={D.toggleFav} className="!min-h-16 !px-8 !text-xl">{D.fav ? <Check /> : <Plus />}{t(D.fav ? "rk.detail.inList" : "rk.detail.addList")}</Pill>
            </div>
            <SourceChooser className="mt-4" alternatives={D.alternatives} selected={D.selected} onSelect={D.selectSource} />
            {plot && <p dir="auto" className="mt-5 line-clamp-6 text-xl leading-relaxed">{plot}</p>}
            {loading && !plot && <div role="status" className="mt-5 space-y-3"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div>}
            {D.error && <p className="mt-3 text-destructive">{D.error}</p>}
          </div>
        </div>
        {isSeries && D.season !== null && (
          <section className="pb-10">
            <h2 className="rk-h">{t("rk.detail.episodes")}</h2>
            <div className="mb-3 flex flex-wrap gap-3">
              {D.seasons.map((s) => <Pill key={s} aria-pressed={s === D.season} onClick={() => D.setSeason(s)} className={s === D.season ? "!bg-accent-blue-container" : ""}>{t("rk.detail.season", { n: s })}</Pill>)}
            </div>
            <div className="rk-list">
              {D.shown.map((e) => {
                const at = D.episodes.indexOf(e)
                const p = D.pct(e.item)
                return (
                  <button key={e.id} data-nav data-pill onClick={() => D.play(D.episodes, at)} className="rk-ch">
                    <span className="w-12 shrink-0 text-center text-3xl font-bold">{e.num}</span>
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-2xl font-bold">{e.title}</span>
                      <span className="block truncate text-lg opacity-70">{D.epLabel(e)}{at === D.resumeIdx ? `  ·  ${D.resumeLabel}` : ""}</span>
                      {p > 0 && <span dir="ltr" className="rk-bar"><span style={{ width: `${p}%` }} /></span>}
                    </span>
                    <Play className="size-8 shrink-0" />
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </Page>
    </Shell>
  )
}
