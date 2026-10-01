import { useEffect, useRef, useState } from "react"
import { Check, ChevronLeft, ChevronRight, Play, Plus } from "lucide-react"
import { Shell, TvButton, Empty } from "@/components/tv/ui"
import { Card, Pill, RoundButton, SkelHero, SkelRail } from "@/components/gtv"
import { cn } from "@/lib/utils"
import { useHomeData } from "../home-data"
import { GRail, useLeft } from "./parts"

const TITLES: Record<string, string> = { favs: "Your watchlist", recents: "Recently watched" }

export default function Home() {
  const h = useHomeData()
  const left = useLeft()
  const scroller = useRef<HTMLDivElement>(null)
  const [n, setN] = useState(0)
  const [hold, setHold] = useState(false)
  const count = h.featured.length
  // auto-advance every 9s unless motion is off or focus is inside the hero
  useEffect(() => {
    if (count < 2 || hold) return
    const t = window.setInterval(() => { if (document.documentElement.dataset.motion !== "off") setN((v) => (v + 1) % count) }, 9000)
    return () => window.clearInterval(t)
  }, [count, hold, n])
  const feat = h.featured
  const pick = feat[Math.min(n, feat.length - 1)] ?? h.hero
  const item = pick?.item
  const art = item?.backdrop || item?.logo
  const meta = item ? [item.year, item.rating ? `★ ${item.rating}` : "", item.genres?.slice(0, 3).join(", ") || item.group, item.dur && item.dur > 60 ? (item.dur >= 3600 ? `${Math.floor(item.dur / 3600)} h ${Math.round((item.dur % 3600) / 60)} min` : `${Math.round(item.dur / 60)} min`) : ""].filter(Boolean).join("  •  ") : ""
  const fav = !!item && h.isFav(item)

  return (
    <Shell page="home" title={h.sourceName ?? "For you"}>
      {h.status === "loading" && (
        <div role="status" className="-mx-[var(--gx)] -mt-[var(--hdr)] h-[calc(100%+var(--hdr))] overflow-hidden px-[var(--gx)]">
          <SkelHero />
          <div className="mb-2 text-base text-muted-foreground">{h.msg}...</div>
          <SkelRail variant="wide" />
          <SkelRail />
        </div>
      )}
      {h.status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div>
          <div className="flex gap-3"><TvButton onClick={h.retry}>Retry</TvButton><TvButton variant="secondary" onClick={h.changeSource}>Change source</TvButton></div></div></Empty>
      )}
      {h.status === "ready" && (
        <div ref={scroller} className="-mx-[var(--gx)] -mt-[var(--hdr)] h-[calc(100%+var(--hdr))] overflow-y-auto px-[var(--gx)] [scroll-padding-top:calc(var(--hdr)+1rem)] [scroll-padding-bottom:4rem]">
          <section onFocus={() => { setHold(true); scroller.current?.scrollTo({ top: 0 }) }} onBlur={() => setHold(false)} className="gtv-hero relative -mx-[var(--gx)] mb-4 h-[58vh] min-h-[26rem] overflow-hidden">
            {art && <div key={item!.id} aria-hidden className="m-fade gtv-hero-art absolute inset-y-0 right-0 w-[65%] max-md:w-full max-md:opacity-40"><img src={art} alt="" decoding="async" className="size-full object-cover" /></div>}
            <div aria-hidden className="gtv-hero-fade absolute inset-0" />
            <div aria-hidden className="gtv-hero-fade-b absolute inset-x-0 bottom-0 h-1/3" />
            {item && (
              <div key={item.id} className="m-fade relative flex h-full max-w-[48rem] flex-col justify-end gap-3 px-[var(--gx)] pb-10 pt-[calc(var(--hdr)+1rem)]">
                <div className="text-sm font-medium tracking-wide text-muted-foreground">{pick!.kicker === "Featured" ? "Top pick for you" : pick!.kicker}</div>
                <h1 className="line-clamp-2 text-5xl font-medium leading-tight tracking-tight">{item.name}</h1>
                {meta && <div className="text-base text-foreground/80">{meta}</div>}
                {item.plot && <p className="line-clamp-3 max-w-xl text-base text-muted-foreground">{item.plot}</p>}
                <div className="-ml-1 mt-2 flex items-center gap-3 p-1">
                  <Pill variant="primary" onClick={() => h.play(item)}><Play className="fill-current" />Watch</Pill>
                  <RoundButton label={fav ? "Remove from watchlist" : "Add to watchlist"} active={fav} onClick={() => h.toggleFav(item)}>{fav ? <Check /> : <Plus />}</RoundButton>
                </div>
              </div>
            )}
            {feat.length > 1 && (
              <div data-nav-group className="absolute bottom-3 right-[var(--gx)] flex items-center gap-1">
                <RoundButton label="Previous featured" onClick={() => setN((n - 1 + feat.length) % feat.length)}><ChevronLeft /></RoundButton>
                {feat.map((f, i) => (
                  <button key={f.item.id} data-nav aria-label={`Featured ${i + 1}`} aria-current={i === n ? "true" : undefined} onClick={() => setN(i)} className="grid size-11 place-items-center rounded-full">
                    <span className={cn("block h-2.5 rounded-full transition-transform", i === n ? "w-7 bg-foreground" : "w-2.5 bg-foreground/40")} />
                  </button>
                ))}
                <RoundButton label="Next featured" onClick={() => setN((n + 1) % feat.length)}><ChevronRight /></RoundButton>
              </div>
            )}
            {!item && <Empty>Pick Live TV, Movies or Shows to start. Favorites and history show up here.</Empty>}
          </section>
          {h.rails.map((r) => (
            <GRail key={r.key} title={TITLES[r.key] ?? r.title} onSeeAll={r.seeAll}>
              {r.items.map((i) => (
                <Card key={i.id} item={i} variant={r.kind} pct={r.pct?.(i)} sub={r.key === "cont" ? left(i) : r.sub?.(i)} onOpen={() => h.open(i, r.items)} />
              ))}
            </GRail>
          ))}
        </div>
      )}
    </Shell>
  )
}
