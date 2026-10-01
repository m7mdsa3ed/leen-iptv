import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Play, Star } from "lucide-react"
import { Chips, Logo } from "@/components/tv/ui"
import { Card, Pill, Rail, RoundButton } from "@/components/gtv"
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

  useEffect(() => {
    if (!item || !src || src.type !== "xtream" || !item.sid) return
    let live = true
    const run = item.kind === "series"
      ? seriesInfo(src, proxy, item).then((r) => { if (live) { setInfo(r.info); setEps(r.episodes); setSeason(r.episodes[0]?.season ?? null) } })
      : vodInfo(src, proxy, item.sid).then((r) => live && setInfo(r))
    run.catch((e) => live && setErr(explain(e)))
    return () => { live = false }
  }, [item, src, proxy])

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
  const plot = text("plot") || text("description") || item.plot
  const meta = [text("releasedate") || text("releaseDate") || text("year"), text("genre"), text("duration"), text("rating") || item.rating].filter(Boolean)
  const shown = eps.filter((e) => e.season === season)

  return (
    <div className="relative h-full overflow-y-auto bg-background px-[var(--gx)] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      {item.logo && <img src={item.logo} alt="" aria-hidden decoding="async" className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] w-full object-cover opacity-30" />}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-r from-background via-background/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-t from-background via-transparent to-transparent" />
      <div className="relative">
        {!isTv && <RoundButton label="Back" onClick={back}><ArrowLeft /></RoundButton>}
        <div className="mt-6 flex flex-col gap-6 md:mt-10 md:flex-row md:gap-10">
          <Logo item={item} className="aspect-[2/3] w-36 shrink-0 self-start rounded-2xl object-cover shadow-2xl md:w-64" />
          <div className="min-w-0 md:flex-1">
            <h1 className="text-3xl font-medium tracking-tight text-foreground md:text-5xl">{item.name}</h1>
            {meta.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{meta.map((m) => <span key={m} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-foreground/80">{m}</span>)}</div>}
            {plot && <p className="mt-5 line-clamp-6 max-w-3xl text-base text-foreground/80 md:text-lg">{plot}</p>}
            {text("cast") && <p className="mt-3 line-clamp-2 max-w-3xl text-base text-muted-foreground">Cast: {text("cast")}</p>}
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
      </div>
    </div>
  )
}
