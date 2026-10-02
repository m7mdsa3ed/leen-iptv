import { ArrowLeft, Clapperboard, Play, Star } from "lucide-react"
import { Chips, Logo } from "@/components/tv/ui"
import { Card, Pill, Rail, RoundButton, SkelBar } from "@/components/gtv"
import { SourceChooser } from "@/components/source/SourceChooser"
import { isTv } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { openTrailer } from "@/components/TrailerModal"
import { useDetail } from "@/layouts/hooks/use-detail"

export default function Detail({ id }: { id: string }) {
  const D = useDetail(id)
  const t = useT()
  const { item, isSeries, loading, error: err, plot, chips, ratings, poster, backdrop, episodes: eps, seasons, season, setSeason, shown, pct, epLabel, play, fav, toggleFav, similar, open, back } = D
  const genreList = D.genres
  if (!item) return null
  return (
    <div className="relative h-full overflow-y-auto bg-background px-[var(--gx)] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      {backdrop && <img src={backdrop} alt="" aria-hidden decoding="async" className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] w-full object-cover opacity-30" />}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-r rtl:bg-gradient-to-l from-background via-background/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-t from-background via-transparent to-transparent" />
      <div className="relative">
        {!isTv && <RoundButton label={t("common.back")} onClick={back}><ArrowLeft className="rtl-flip" /></RoundButton>}
        <div className="mt-6 flex flex-col gap-6 md:mt-10 md:flex-row md:gap-10">
          <Logo item={poster!} className="aspect-[2/3] w-36 shrink-0 self-start rounded-2xl object-cover shadow-2xl md:w-64" />
          <div className="min-w-0 md:flex-1">
            <h1 dir="auto" className="text-3xl font-medium tracking-tight text-foreground md:text-5xl">{item.name}</h1>
            <SourceChooser className="mt-4" alternatives={D.alternatives} selected={D.selected} onSelect={D.selectSource} />
            {(chips.length > 0 || ratings.length > 0 || genreList.length > 0) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {item.group && <button data-nav onClick={() => D.openCategory()} className="rounded-full bg-accent-blue-container px-3 py-1 text-sm text-foreground"><bdi>{item.group}</bdi></button>}
                {genreList.map((g) => <button key={g} data-nav onClick={() => D.openGenre(g)} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-foreground/80"><bdi>{g}</bdi></button>)}
                {chips.map((m) => <span key={m} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-foreground/80"><bdi>{m}</bdi></span>)}
                {ratings.map((r) => <span key={r.source} className="rounded-full bg-accent-blue-container px-3 py-1 text-sm text-foreground">{r.source} <b>{r.value}</b></span>)}
              </div>
            )}
            {plot && <p dir="auto" className="mt-5 line-clamp-6 max-w-3xl text-base text-foreground/80 md:text-lg">{plot}</p>}
            {D.directors.length ? <p className="mt-3 max-w-3xl text-base text-muted-foreground">{t(isSeries ? "pages.detail.createdBy" : "pages.detail.director", { names: D.directors.join(", ") })}</p> : null}
            {!D.cast.length && D.castText && <p className="mt-3 line-clamp-2 max-w-3xl text-base text-muted-foreground">{t("pages.detail.cast", { names: D.castText })}</p>}
            {loading && !plot && (
              <div role="status" aria-label={t("pages.detail.loading")} className="mt-5 max-w-3xl space-y-3">
                <SkelBar className="w-full" /><SkelBar className="w-11/12" /><SkelBar className="w-2/3" />
              </div>
            )}
            {err && <p className="mt-3 text-destructive">{err}</p>}
            <div className="-ms-1 mt-6 flex flex-wrap items-center gap-3 p-1">
              <Pill variant="primary" data-autofocus="" onClick={D.playMain} disabled={!D.canPlay}>
                <Play className="fill-current" />{D.resumeLabel}
              </Pill>
              <RoundButton label={fav ? t("pages.detail.removeFav") : t("pages.detail.addFav")} active={fav} onClick={toggleFav}>
                <Star className={fav ? "fill-yellow-400 text-yellow-400" : ""} />
              </RoundButton>
              {D.trailer && <Pill onClick={() => openTrailer(D.trailer!)}><Clapperboard />{t("trailer.button")}</Pill>}
            </div>
          </div>
        </div>
        {isSeries && season !== null && (
          <div className="mt-8">
            <Chips items={seasons.map((s) => t("pages.detail.season", { n: s }))} active={t("pages.detail.season", { n: season })} onPick={(l) => setSeason(seasons.find((s) => t("pages.detail.season", { n: s }) === l) ?? season)} />
            <Rail>
              {shown.map((e) => {
                return <Card key={e.id} item={e.item} variant="wide" pct={pct(e.item)} onOpen={() => play(eps, eps.indexOf(e))} sub={epLabel(e)} />
              })}
            </Rail>
          </div>
        )}
        {loading && !D.cast.length && (
          <section aria-hidden className="mt-8">
            <h2 className="mb-3 text-2xl font-medium tracking-tight">{t("pages.detail.castTitle")}</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex w-24 flex-col items-center md:w-28">
                  <div className="size-20 animate-pulse rounded-full bg-surface-2 md:size-24" />
                  <SkelBar className="mt-3 w-4/5" />
                </div>
              ))}
            </div>
          </section>
        )}
        {D.cast.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-2xl font-medium tracking-tight">{t("pages.detail.castTitle")}</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-4">
              {D.cast.slice(0, 12).map((c) => (
                <button key={c.name} data-nav onClick={() => D.openPerson(c)} className="flex w-24 flex-col items-center rounded-2xl p-1 text-center md:w-28">
                  {c.photo
                    ? <img src={c.photo} alt="" loading="lazy" decoding="async" className="size-20 rounded-full bg-surface-2 object-cover md:size-24" />
                    : <div className="grid size-20 place-items-center rounded-full bg-surface-2 text-2xl font-medium md:size-24">{c.name.slice(0, 1)}</div>}
                  <div dir="auto" className="mt-2 w-full truncate text-sm">{c.name}</div>
                  {c.role && <div dir="auto" className="w-full truncate text-xs text-muted-foreground">{c.role}</div>}
                </button>
              ))}
            </div>
          </section>
        )}
        {similar.length > 0 && (
          <div className="mt-6">
            <Rail title={t("pages.detail.similar")}>
              {similar.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}
            </Rail>
          </div>
        )}
      </div>
    </div>
  )
}
