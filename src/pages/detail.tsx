import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Play, Star } from "lucide-react"
import { Chips, Logo, useOpen } from "@/components/tv/ui"
import { Card, Pill, Rail, RoundButton, SkelBar } from "@/components/gtv"
import { useMeta, useSimilar } from "@/lib/meta"
import { explain } from "@/lib/net"
import { useCatalog } from "@/lib/catalog"
import { isTv } from "@/lib/device"
import { useRoute } from "@/lib/nav"
import { useApp, usePData, useSource } from "@/lib/store"
import type { Episode } from "@/lib/types"
import { seriesInfo, vodInfo } from "@/lib/xtream"

type Info = Record<string, string | number | undefined>

export default function Detail({ id }: { id: string }) {
  const item = useCatalog((s) => s.byId.get(id))
  const src = useSource()
  const proxy = useApp((s) => s.settings.proxy)
  const toggleFav = useApp((s) => s.toggleFav)
  const d = usePData()
  const go = useRoute((s) => s.go)
  const back = useRoute((s) => s.back)
  const [info, setInfo] = useState<Info>({})
  const [eps, setEps] = useState<Episode[]>([])
  const [season, setSeason] = useState<number | null>(null)
  const [err, setErr] = useState("")
  const [loaded, setLoaded] = useState(false) // Xtream info fetched (or not applicable): metadata providers can start
  const open = useOpen()

  useEffect(() => {
    if (!item) return
    if (!src || src.type !== "xtream" || !item.sid) return setLoaded(true)
    let live = true
    const run = item.kind === "series"
      ? seriesInfo(src, proxy, item).then((r) => { if (live) { setInfo(r.info); setEps(r.episodes); setSeason(r.episodes[0]?.season ?? null) } })
      : vodInfo(src, proxy, item.sid).then((r) => live && setInfo(r))
    run.catch((e) => live && setErr(explain(e))).finally(() => live && setLoaded(true))
    return () => { live = false }
  }, [item, src, proxy])

  const { meta, loading } = useMeta(item, info, loaded)
  const similar = useSimilar(item, meta)
  const seasons = useMemo(() => [...new Set(eps.map((e) => e.season))], [eps])
  if (!item) return null
  const isSeries = item.kind === "series"
  const prog = (x: { id: string }) => d.progress[x.id]
  const done = (x: { id: string }) => !!prog(x) && prog(x).pos / prog(x).dur > 0.95
  // resume: the last-touched episode if unfinished, otherwise the one after it
  const resumeIdx = (() => {
    if (!isSeries) return 0
    const last = eps.map((e, i) => [i, prog(e.item)?.t ?? 0] as const).sort((a, b) => b[1] - a[1])[0]
    return last && last[1] ? Math.min(eps.length - 1, last[0] + (done(eps[last[0]].item) ? 1 : 0)) : 0
  })()
  const play = (queue: typeof eps | null, i: number) => go("player", { queue: queue ? queue.map((e) => e.item) : [item], index: i })
  const p = prog(item)
  const fav = d.favs.includes(item.id)
  const text = (k: string) => (info[k] ? String(info[k]) : "")
  const plot = meta?.plot || text("plot") || text("description") || item.plot
  const chips = [meta?.year || text("releasedate").slice(0, 4) || text("releaseDate").slice(0, 4) || text("year"), meta?.runtime || text("duration")].filter(Boolean)
  const genreList = (meta?.genres.length ? meta.genres : text("genre").split(/\s*[,/]\s*/)).filter(Boolean).slice(0, 4)
  const ratings = meta?.ratings.length ? meta.ratings : [text("rating") || item.rating].filter(Boolean).map((v) => ({ source: "Rating", value: String(v), votes: undefined }))
  const poster = item.logo ? item : { ...item, logo: meta?.poster }
  const backdrop = meta?.backdrop || item.logo
  const shown = eps.filter((e) => e.season === season)

  return (
    <div className="relative h-full overflow-y-auto bg-background px-[var(--gx)] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      {backdrop && <img src={backdrop} alt="" aria-hidden decoding="async" className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] w-full object-cover opacity-30" />}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-r from-background via-background/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-t from-background via-transparent to-transparent" />
      <div className="relative">
        {!isTv && <RoundButton label="Back" onClick={back}><ArrowLeft /></RoundButton>}
        <div className="mt-6 flex flex-col gap-6 md:mt-10 md:flex-row md:gap-10">
          <Logo item={poster} className="aspect-[2/3] w-36 shrink-0 self-start rounded-2xl object-cover shadow-2xl md:w-64" />
          <div className="min-w-0 md:flex-1">
            <h1 className="text-3xl font-medium tracking-tight text-foreground md:text-5xl">{item.name}</h1>
            {(chips.length > 0 || ratings.length > 0 || genreList.length > 0) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {item.group && <button data-nav onClick={() => go("category", { id: `${item.kind}|${item.group}` })} className="rounded-full bg-accent-blue-container px-3 py-1 text-sm text-foreground">{item.group}</button>}
                {genreList.map((g) => <button key={g} data-nav onClick={() => go("genre", { id: `${item.kind}|${g}` })} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-foreground/80">{g}</button>)}
                {chips.map((m) => <span key={m} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-foreground/80">{m}</span>)}
                {ratings.map((r) => <span key={r.source} className="rounded-full bg-accent-blue-container px-3 py-1 text-sm text-foreground">{r.source} <b>{r.value}</b></span>)}
              </div>
            )}
            {plot && <p className="mt-5 line-clamp-6 max-w-3xl text-base text-foreground/80 md:text-lg">{plot}</p>}
            {meta?.directors.length ? <p className="mt-3 max-w-3xl text-base text-muted-foreground">{isSeries ? "Created by" : "Director"}: {meta.directors.join(", ")}</p> : null}
            {!meta?.cast.length && text("cast") && <p className="mt-3 line-clamp-2 max-w-3xl text-base text-muted-foreground">Cast: {text("cast")}</p>}
            {loading && !plot && (
              <div role="status" aria-label="Loading details" className="mt-5 max-w-3xl space-y-3">
                <SkelBar className="w-full" /><SkelBar className="w-11/12" /><SkelBar className="w-2/3" />
              </div>
            )}
            {err && <p className="mt-3 text-destructive">{err}</p>}
            <div className="-ml-1 mt-6 flex flex-wrap items-center gap-3 p-1">
              <Pill variant="primary" data-autofocus="" onClick={() => (isSeries ? eps.length && play(eps, resumeIdx) : play(null, 0))} disabled={isSeries && !eps.length}>
                <Play className="fill-current" />{(isSeries ? eps.some((e) => prog(e.item)) : p && p.pos > 30) ? "Resume" : "Play"}
              </Pill>
              <RoundButton label={fav ? "Remove from favorites" : "Add to favorites"} active={fav} onClick={() => toggleFav(item.id)}>
                <Star className={fav ? "fill-yellow-400 text-yellow-400" : ""} />
              </RoundButton>
            </div>
          </div>
        </div>
        {isSeries && season !== null && (
          <div className="mt-8">
            <Chips items={seasons.map((s) => `Season ${s}`)} active={`Season ${season}`} onPick={(s) => setSeason(+s.replace("Season ", ""))} />
            <Rail>
              {shown.map((e) => {
                const q = prog(e.item)
                const pc = q ? Math.round((q.pos / q.dur) * 100) : 0
                return <Card key={e.id} item={e.item} variant="wide" pct={pc} onOpen={() => play(eps, eps.indexOf(e))} sub={[`E${e.num}`, e.dur, done(e.item) ? "Watched" : ""].filter(Boolean).join("  ·  ")} />
              })}
            </Rail>
          </div>
        )}
        {loading && !meta?.cast.length && (
          <section aria-hidden className="mt-8">
            <h2 className="mb-3 text-2xl font-medium tracking-tight">Cast</h2>
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
        {meta && meta.cast.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-2xl font-medium tracking-tight">Cast</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-4">
              {meta.cast.slice(0, 12).map((c) => (
                <button key={c.name} data-nav onClick={() => go("person", { id: c.id, name: c.name })} className="flex w-24 flex-col items-center rounded-2xl p-1 text-center md:w-28">
                  {c.photo
                    ? <img src={c.photo} alt="" loading="lazy" decoding="async" className="size-20 rounded-full bg-surface-2 object-cover md:size-24" />
                    : <div className="grid size-20 place-items-center rounded-full bg-surface-2 text-2xl font-medium md:size-24">{c.name.slice(0, 1)}</div>}
                  <div className="mt-2 w-full truncate text-sm">{c.name}</div>
                  {c.role && <div className="w-full truncate text-xs text-muted-foreground">{c.role}</div>}
                </button>
              ))}
            </div>
          </section>
        )}
        {similar.length > 0 && (
          <div className="mt-6">
            <Rail title="More like this">
              {similar.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}
            </Rail>
          </div>
        )}
      </div>
    </div>
  )
}
