import { Backdrop } from "@/components/Backdrop"
import { Check, ChevronDown, Clapperboard, Play, Plus, X } from "lucide-react"
import { Logo } from "@/components/tv/ui"
import { SkelBar } from "@/components/gtv"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { openTrailer } from "@/components/TrailerModal"
import { useDetail } from "../../hooks/use-detail"
import type { Item } from "@/lib/types"
import { Dropdown, Pick, SourceChooser, match } from "../ui"

const Links = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="text-sm leading-6"><span className="text-muted-foreground">{label} </span>{children}</div>
)
function Sep({ list, render }: { list: string[]; render: (s: string) => React.ReactNode }) {
  const t = useT()
  return <>{list.map((s, i) => <span key={s} dir="auto">{i > 0 && t("nf.sep")}{render(s)}</span>)}</>
}

/** "More Info" modal-style page: 16:9 artwork header with title + Play / My List, two info columns, episodes, More Like This, About. */
export default function Detail({ id }: { id: string }) {
  const t = useT()
  const D = useDetail(id)
  const { item, isSeries, plot, chips, ratings, genres, cast, directors, loading } = D
  if (!item) return null
  const m = match(item)
  const castNames = cast.length ? cast.slice(0, 12) : []
  const poster = (i: Item) => ({ ...i, logo: i.backdrop ?? i.logo })
  return (
    <div className="h-full overflow-y-auto bg-background pb-[env(safe-area-inset-bottom)] md:px-[var(--gx)] md:py-8">
      <div className="nf-modal">
        <div className="relative aspect-video bg-surface-2">
          {D.backdrops.length > 0 && <Backdrop srcs={D.backdrops} className="absolute inset-0" />}
          <div aria-hidden className="absolute inset-0 nf-fade-s" />
          {!isTv && <button data-nav aria-label={t("nf.detail.close")} onClick={D.back} className="nf-circle absolute end-3 top-3 !size-10 !bg-[rgba(24,24,24,.8)]"><X className="size-5" /></button>}
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 px-[clamp(1rem,3vw,3rem)] pb-4 md:pb-6">
            <h1 dir="auto" className="line-clamp-2 max-w-[80%] text-[clamp(1.6rem,4vw,3rem)] font-black leading-tight tracking-tight">{item.name}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <button data-nav data-autofocus="" disabled={!D.canPlay} onClick={D.playMain} className="nf-btn nf-play disabled:opacity-50"><Play className="fill-current" />{D.resumeLabel}</button>
              <button data-nav aria-label={D.fav ? t("nf.ui.removeList") : t("nf.ui.addList")} onClick={D.toggleFav} className="nf-circle">{D.fav ? <Check className="size-6" /> : <Plus className="size-6" />}</button>
              {D.trailer && <button data-nav onClick={() => openTrailer(D.trailer!)} className="nf-btn nf-info-btn"><Clapperboard />{t("trailer.button")}</button>}
            </div>
          </div>
        </div>

        <div className="grid gap-x-8 gap-y-5 px-[clamp(1rem,3vw,3rem)] py-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
              {m > 0 && <span className="nf-match">{t("nf.match", { n: m })}</span>}
              {chips.map((c) => <span key={c} dir="auto" className="text-muted-foreground">{c}</span>)}
              {ratings.map((r) => <span key={r.source} className="rounded-sm border border-[var(--fg-40)] px-1.5 text-xs">{r.source} {r.value}</span>)}
            </div>
            {D.alternatives.length > 1 && <div className="mt-4"><SourceChooser list={D.alternatives} selected={D.selected} onSelect={D.selectSource} /></div>}
            {plot && <p dir="auto" className="mt-4 text-base leading-relaxed md:text-lg">{plot}</p>}
            {loading && !plot && <div role="status" aria-label={t("nf.detail.loading")} className="mt-4 space-y-3"><SkelBar className="w-full" /><SkelBar className="w-11/12" /><SkelBar className="w-2/3" /></div>}
            {D.error && <p className="mt-3 text-destructive">{D.error}</p>}
          </div>
          <div className="min-w-0 space-y-2">
            {castNames.length > 0 ? (
              <Links label={t("nf.detail.cast")}><Sep list={castNames.slice(0, 4).map((c) => c.name)} render={(n) => <button data-nav className="nf-link" onClick={() => D.openPerson(castNames.find((c) => c.name === n)!)}>{n}</button>} /></Links>
            ) : D.castText ? <Links label={t("nf.detail.cast")}><span dir="auto" className="line-clamp-2">{D.castText}</span></Links> : null}
            {genres.length > 0 && <Links label={t("nf.detail.genres")}><Sep list={genres} render={(g) => <button data-nav className="nf-link" onClick={() => D.openGenre(g)}>{g}</button>} /></Links>}
            {item.group && <Links label={t(isSeries ? "nf.detail.thisShow" : "nf.detail.thisMovie")}><button data-nav className="nf-link" onClick={D.openCategory}>{item.group}</button></Links>}
          </div>
        </div>

        {isSeries && D.season !== null && (
          <section className="px-[clamp(1rem,3vw,3rem)] pb-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">{t("nf.detail.episodes")}</h2>
              <Dropdown align="right" className="nf-drop" trigger={<>{t("nf.detail.season", { n: D.season })}<ChevronDown className="size-4" /></>}>
                {(close) => D.seasons.map((s) => <Pick key={s} active={s === D.season} onClick={() => { close(); D.setSeason(s) }}>{t("nf.detail.season", { n: s })}</Pick>)}
              </Dropdown>
            </div>
            <div data-nav-group>
              {D.shown.map((e) => {
                const at = D.episodes.indexOf(e)
                const p = D.pct(e.item)
                return (
                  <button key={e.id} data-nav onClick={() => D.play(D.episodes, at)} className="nf-ep" style={at === D.resumeIdx ? { background: "var(--surface-2)" } : undefined}>
                    <span className="w-6 shrink-0 text-center text-xl text-muted-foreground">{e.num}</span>
                    <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-sm bg-surface-3 md:w-36">
                      <Logo item={poster(e.item)} className="size-full object-cover" />
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
          </section>
        )}

        {D.similar.length > 0 && (
          <section className="px-[clamp(1rem,3vw,3rem)] pb-4 pt-2">
            <h2 className="mb-3 text-2xl font-bold">{t("nf.detail.similar")}</h2>
            <div data-nav-group className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {D.similar.slice(0, 12).map((i) => (
                <button key={i.id} data-nav className="nf-more" onClick={() => D.open(i)}>
                  <span className="relative block aspect-video bg-surface-3"><Logo item={poster(i)} className="size-full object-cover" /></span>
                  <span className="block p-3">
                    <span dir="auto" className="block truncate text-sm font-bold">{i.name}</span>
                    <span className="mt-0.5 flex gap-2 text-xs">{match(i) > 0 && <span className="nf-match">{t("nf.match", { n: fmt.number(match(i)) })}</span>}<span className="text-muted-foreground">{i.year && fmt.digits(i.year)}</span></span>
                    {i.plot ? <span dir="auto" className="mt-2 line-clamp-3 block text-xs text-muted-foreground">{i.plot}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2 px-[clamp(1rem,3vw,3rem)] pb-8 pt-4">
          <h2 className="mb-2 text-2xl font-bold">{t("nf.detail.about")} <span dir="auto" className="font-black">{item.name}</span></h2>
          {directors.length > 0 && <Links label={t(isSeries ? "nf.detail.createdBy" : "nf.detail.director")}><span dir="auto">{directors.join(t("nf.sep"))}</span></Links>}
          {castNames.length > 0 && <Links label={t("nf.detail.cast")}><Sep list={castNames.map((c) => c.name)} render={(n) => <button data-nav className="nf-link" onClick={() => D.openPerson(castNames.find((c) => c.name === n)!)}>{n}</button>} /></Links>}
          {genres.length > 0 && <Links label={t("nf.detail.genres")}><span dir="auto">{genres.join(t("nf.sep"))}</span></Links>}
          {item.group && <Links label={t("nf.detail.category")}><span dir="auto">{item.group}</span></Links>}
        </section>
      </div>
    </div>
  )
}
