import { useState } from "react"
import { Backdrop } from "@/components/Backdrop"
import { Check, Clapperboard, Play, Plus } from "lucide-react"
import { Logo } from "@/components/tv/ui"
import { SkelBar } from "@/components/gtv"
import { openTrailer } from "@/components/TrailerModal"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useDetail } from "../../hooks/use-detail"
import { Tile } from "../ui"

type Tab = "episodes" | "related" | "details"

/** Detail: backdrop hero with a bottom info band (title, chips, Play / list / trailer, plot), then tab-like sections Episodes / Related / Details. */
export default function Detail({ id }: { id: string }) {
  const t = useT()
  const D = useDetail(id)
  const { item, isSeries, plot, chips, ratings, genres, cast, directors, loading } = D
  const [tab, setTab] = useState<Tab | null>(null)
  if (!item) return null
  const tabs: Tab[] = [...(isSeries && D.season !== null ? ["episodes" as const] : []), ...(D.similar.length ? ["related" as const] : []), "details"]
  const cur = tab && tabs.includes(tab) ? tab : tabs[0]
  const row = (label: string, v: React.ReactNode) => <div className="text-sm leading-7"><span className="text-muted-foreground">{label}: </span>{v}</div>
  const castNames = cast.slice(0, 12)
  return (
    <div className="h-full overflow-y-auto bg-background pb-[env(safe-area-inset-bottom)]">
      <section className="pv-dhero">
        {D.backdrops.length > 0 && <Backdrop srcs={D.backdrops} className="absolute inset-0" />}
        <div aria-hidden className="pv-dhero-fade" />
        <div className="pv-dband">
          <h1 dir="auto" className="line-clamp-2 text-[clamp(1.6rem,3.4vw,3rem)] font-extrabold leading-tight tracking-tight">{item.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => <span key={c} dir="auto" className="pv-chip pv-meta">{c}</span>)}
            {ratings.map((r) => <span key={r.source} className="pv-chip pv-rate">{D.ratingName(r.source)} {r.value}</span>)}
          </div>
          {plot ? <p dir="auto" className="line-clamp-3 max-w-3xl text-sm text-[var(--fg-80)] md:text-base">{plot}</p> : loading ? <div role="status" aria-label={t("pv.detail.loading")} className="max-w-xl space-y-2"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div> : null}
          {D.error && <p className="text-destructive">{D.error}</p>}
          {D.alternatives.length > 1 && (
            <div data-nav-group className="pv-chips !p-0"><span className="self-center text-sm text-muted-foreground">{t("pv.availableOn")}</span>
              {D.alternatives.map(({ item: a, source }) => (
                <button key={a.id} data-nav aria-pressed={a.id === D.selected?.id} onClick={() => D.selectSource(a)} className="pv-chip"><span aria-hidden className="size-2.5 rounded-full" style={{ background: source.color }} />{source.name}</button>
              ))}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <button data-nav data-autofocus="" disabled={!D.canPlay} onClick={D.playMain} className="pv-btn pv-pri disabled:opacity-50"><Play className="fill-current" />{D.resumeLabel}</button>
            <button data-nav aria-label={t(D.fav ? "common.removeFav" : "common.addFav")} onClick={D.toggleFav} className="pv-btn pv-sec !px-3">{D.fav ? <Check /> : <Plus />}</button>
            {D.trailer && <button data-nav onClick={() => openTrailer(D.trailer!)} className="pv-btn pv-sec"><Clapperboard />{t("trailer.button")}</button>}
          </div>
        </div>
      </section>

      <div className="px-[var(--gx)]">
        <div role="tablist" data-nav-group className="pv-tabs">
          {tabs.map((k) => <button key={k} role="tab" data-nav aria-selected={k === cur} onClick={() => setTab(k)} className="pv-tab">{t(`pv.detail.${k}`)}</button>)}
        </div>

        {cur === "episodes" && (
          <div className="pb-16">
            <div data-nav-group className="pv-chips !pt-3">
              {D.seasons.map((s) => <button key={s} data-nav aria-pressed={s === D.season} onClick={() => D.setSeason(s)} className="pv-chip">{t("pv.detail.season", { n: s })}</button>)}
            </div>
            <div data-nav-group>
              {D.shown.map((e) => {
                const at = D.episodes.indexOf(e)
                const p = D.pct(e.item)
                return (
                  <button key={e.id} data-nav onClick={() => D.play(D.episodes, at)} className={cn("pv-ep", at === D.resumeIdx && "pv-ep-on")}>
                    <span className="w-6 shrink-0 text-center text-lg text-muted-foreground">{e.num}</span>
                    <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded bg-surface-3 md:w-36">
                      <Logo item={{ ...e.item, logo: e.item.backdrop ?? e.item.logo }} className="size-full object-cover" />
                      {p > 0 && <span dir="ltr" className="absolute inset-x-0 bottom-0 block h-1 bg-white/30"><span className="block h-full bg-accent-blue" style={{ width: `${p}%` }} /></span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-base font-bold">{e.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">{D.epLabel(e)}</span>
                    </span>
                    <Play className="size-5 shrink-0 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {cur === "related" && <div className="pv-grid !pb-16">{D.similar.slice(0, 24).map((i) => <Tile key={i.id} item={i} onOpen={() => D.open(i)} />)}</div>}

        {cur === "details" && (
          <div className="max-w-3xl space-y-1 pb-16 pt-4">
            {directors.length > 0 && row(t(isSeries ? "pv.detail.createdBy" : "pv.detail.director"), <span dir="auto">{directors.join(t("pv.sep"))}</span>)}
            {castNames.length > 0 ? row(t("pv.detail.cast"), castNames.map((c, i) => <span key={c.name} dir="auto">{i > 0 && t("pv.sep")}<button data-nav className="pv-link" onClick={() => D.openPerson(c)}>{c.name}</button></span>)) : D.castText ? row(t("pv.detail.cast"), <span dir="auto">{D.castText}</span>) : null}
            {genres.length > 0 && row(t("pv.detail.genres"), genres.map((g, i) => <span key={g} dir="auto">{i > 0 && t("pv.sep")}<button data-nav className="pv-link" onClick={() => D.openGenre(g)}>{g}</button></span>))}
            {item.group && row(t("pv.detail.category"), <button data-nav className="pv-link" dir="auto" onClick={D.openCategory}>{item.group}</button>)}
          </div>
        )}
      </div>
    </div>
  )
}
