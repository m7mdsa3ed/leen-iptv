import { Fragment, useState } from "react"
import { ArrowLeft, Check, ChevronDown, Play, Plus } from "lucide-react"
import { Logo } from "@/components/tv/ui"
import { Card, Pill, RoundButton, SkelBar } from "@/components/gtv"
import { isTv } from "@/lib/device"
import { useDetail } from "@/layouts/hooks/use-detail"
import { GRail } from "../parts"

const chip = "rounded-full bg-surface-2 px-3 py-1 text-sm text-foreground/80"

/** Google TV details: full-bleed backdrop, poster left, Watch + watchlist, then Episodes / Cast & crew / More like this / Details rails. */
export default function Detail({ id }: { id: string }) {
  const D = useDetail(id)
  const { item, isSeries, loading, plot, chips, ratings, poster, backdrop, episodes: eps, seasons, season, setSeason, shown, pct, epLabel, play, fav, toggleFav, similar, open } = D
  const [menu, setMenu] = useState(false)
  const rp = item && (isSeries ? D.episodes[D.resumeIdx]?.item : item)
  const pr = rp ? D.progress(rp) : undefined
  const left = D.resumeLabel === "Resume" && pr && pr.dur > pr.pos ? Math.max(1, Math.ceil((pr.dur - pr.pos) / 60)) : 0
  if (!item) return null
  return (
    <div className="relative h-full bg-background">
      {backdrop && <img src={backdrop} alt="" aria-hidden decoding="async" className="pointer-events-none absolute inset-0 size-full object-cover opacity-60" />}
      <div aria-hidden className="gtv-hero-fade pointer-events-none absolute inset-0" />
      <div aria-hidden className="gtv-hero-fade-b pointer-events-none absolute inset-x-0 bottom-0 h-1/2" />
      <div className="relative h-full overflow-y-auto px-[var(--gx)] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        {!isTv && <RoundButton label="Back" onClick={D.back}><ArrowLeft /></RoundButton>}
        <div className="mt-6 flex flex-col gap-6 md:mt-8 md:flex-row md:gap-10">
          <Logo item={poster!} className="aspect-[2/3] w-36 shrink-0 self-start rounded-2xl object-cover md:w-56" />
          <div className="min-w-0 md:flex-1">
            <h1 className="text-4xl font-medium tracking-tight md:text-5xl">{item.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {chips.map((m) => <span key={m} className="text-base text-foreground/80">{m}</span>)}
              {ratings.map((r) => <span key={r.source} className="rounded-md border border-foreground/40 px-2 py-0.5 text-sm">{r.source} <b>{r.value}</b></span>)}
              {D.genres.map((g) => <button key={g} data-nav onClick={() => D.openGenre(g)} className={chip}>{g}</button>)}
            </div>
            {plot && <p className="mt-4 line-clamp-4 max-w-2xl text-base text-foreground/80 md:text-lg">{plot}</p>}
            {loading && !plot && <div role="status" aria-label="Loading details" className="mt-4 max-w-2xl space-y-3"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div>}
            {D.error && <p className="mt-3 text-destructive">{D.error}</p>}
            <div className="-ml-1 mt-6 flex flex-wrap items-center gap-3 p-1">
              <Pill variant="primary" data-autofocus="" onClick={D.playMain} disabled={!D.canPlay}><Play className="fill-current" />{left ? `Resume · ${left} min left` : D.resumeLabel === "Play" ? "Watch" : "Resume"}</Pill>
              <RoundButton label={fav ? "Remove from watchlist" : "Add to watchlist"} active={fav} onClick={toggleFav}>{fav ? <Check /> : <Plus />}</RoundButton>
            </div>
          </div>
        </div>
        {isSeries && (
          <div className="mt-8">
            <div className="relative flex items-center gap-3">
              <h2 className="text-[1.4rem] font-normal">Episodes</h2>
              {season !== null && <Pill aria-expanded={menu} aria-haspopup="listbox" onClick={() => setMenu(!menu)}>Season {season}<ChevronDown /></Pill>}
              {menu && (
                <div role="listbox" data-nav-group className="absolute left-0 top-full z-20 mt-1 flex max-h-72 min-w-48 flex-col gap-1 overflow-y-auto rounded-2xl bg-surface-3 p-2 shadow-lg">
                  {seasons.map((x) => <Pill key={x} role="option" aria-selected={x === season} variant={x === season ? "primary" : "ghost"} className="justify-start" onClick={() => { setSeason(x); setMenu(false) }}>Season {x}</Pill>)}
                </div>
              )}
            </div>
            {season !== null ? <GRail>{shown.map((e) => <Card key={e.id} item={e.item} variant="wide" pct={pct(e.item)} onOpen={() => play(eps, eps.indexOf(e))} sub={epLabel(e)} />)}</GRail> : !loading && <p className="mt-2 text-base text-muted-foreground">No episodes found.</p>}
          </div>
        )}
        {D.cast.length > 0 && (
          <GRail title="Cast & crew">
            {D.cast.slice(0, 20).map((c) => (
              <button key={c.name} data-nav onClick={() => D.openPerson(c)} className="flex w-28 shrink-0 flex-col items-center rounded-2xl p-1 text-center">
                {c.photo ? <img src={c.photo} alt="" loading="lazy" decoding="async" className="size-24 rounded-full bg-surface-2 object-cover" /> : <div className="grid size-24 place-items-center rounded-full bg-surface-2 text-2xl font-medium">{c.name.slice(0, 1)}</div>}
                <div className="mt-2 w-full truncate text-sm">{c.name}</div>
                {c.role && <div className="w-full truncate text-xs text-muted-foreground">{c.role}</div>}
              </button>
            ))}
          </GRail>
        )}
        {similar.length > 0 && <GRail title="More like this">{similar.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</GRail>}
        <section className="mt-4 max-w-3xl">
          <h2 className="mb-2 text-[1.4rem] font-normal">Details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-base">
            {item.group && <><dt className="text-muted-foreground">Category</dt><dd><button data-nav onClick={() => D.openCategory()} className="rounded-full px-2 text-left underline-offset-4 hover:underline">{item.group}</button></dd></>}
            {D.directors.length > 0 && <><dt className="text-muted-foreground">{isSeries ? "Created by" : "Director"}</dt><dd>{D.directors.join(", ")}</dd></>}
            {!D.cast.length && D.castText && <><dt className="text-muted-foreground">Cast</dt><dd className="line-clamp-2">{D.castText}</dd></>}
            {ratings.map((r) => <Fragment key={r.source}><dt className="text-muted-foreground">{r.source}</dt><dd>{r.value}{r.votes ? ` (${r.votes})` : ""}</dd></Fragment>)}
          </dl>
        </section>
      </div>
    </div>
  )
}
