import { useMemo, useRef } from "react"
import { useCatalog } from "@/lib/catalog"
import { Info, Play } from "lucide-react"
import { Shell, TvButton, Empty } from "@/components/tv/ui"
import { useHomeData } from "../home-data"
import { Row, SkelRows, Tile, TopRow, match, useTopRated, usePlay } from "./ui"

type H = ReturnType<typeof useHomeData>

/** Billboard: full-width artwork, title + synopsis bottom-left, Play / More Info, (no maturity data in our catalog, so no badge). */
function Billboard({ h }: { h: H }) {
  const play = usePlay()
  const pick = h.hero
  if (!pick) return <Empty>Pick Live TV, Movies or Series to start. Favorites and history show up here.</Empty>
  const { item } = pick
  const src = item.backdrop ?? item.logo
  const m = match(item)
  const meta = [item.year, item.group, ...(item.genres?.slice(0, 2) ?? [])].filter(Boolean).join("  ·  ")
  return (
    <section className="nf-bb">
      {src && <img src={src} alt="" aria-hidden decoding="async" className="nf-bb-img" />}
      <div aria-hidden className="nf-vig-l" />
      <div aria-hidden className="nf-vig-b" />
      <div className="nf-bb-body m-fade">
        <h2 className="nf-bb-title line-clamp-2">{item.name}</h2>
        <div className="flex flex-wrap items-center gap-x-3 text-base font-semibold">
          {m > 0 && <span className="nf-match">{m}% Match</span>}
          {meta && <span className="text-[var(--fg-80)]">{meta}</span>}
        </div>
        {item.plot ? <p className="line-clamp-3 text-base text-[var(--fg-80)] md:text-lg">{item.plot}</p> : null}
        <div className="mt-1 flex flex-wrap gap-3">
          <button data-nav data-autofocus="" onClick={() => play(item, h.live)} className="nf-btn nf-play"><Play className="fill-current" />Play</button>
          {item.kind !== "live" && <button data-nav onClick={() => h.info(item)} className="nf-btn nf-info-btn"><Info />More Info</button>}
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const h = useHomeData()
  const play = usePlay()
  const top = useTopRated(10)
  const scroller = useRef<HTMLDivElement>(null)
  const byKind = useCatalog((s) => s.byKind)
  // newest additions of the library (catalog order, last = newest)
  const trending = useMemo(() => [...byKind.movie.slice(-10), ...byKind.series.slice(-10)].reverse(), [byKind])
  const cont = h.rails.find((r) => r.key === "cont")
  const rest = h.rails.filter((r) => r.key !== "cont")
  const mine = rest.filter((r) => r.key === "favs")
  const others = rest.filter((r) => r.key !== "favs")
  const railOf = (r: (typeof h.rails)[number]) => (
    <Row key={r.key} title={r.key === "favs" ? "My List" : r.title} onSeeAll={r.seeAll}>
      {r.items.map((i) => <Tile key={i.id} item={i} variant={r.kind} pct={r.pct?.(i)} sub={r.sub?.(i)} onOpen={() => h.open(i, r.items)} onPlay={() => play(i, r.items)} />)}
    </Row>
  )
  const topRow = top.length >= 5 && <TopRow key="top10" title="Top 10 in your library" items={top} onOpen={(i) => h.open(i)} onPlay={(i) => play(i)} />
  return (
    <Shell page="home" title={h.sourceName ?? "Home"}>
      {h.status === "loading" && (
        <div className="-mx-[var(--gx)] -mt-[var(--hdr)] h-[calc(100%+var(--hdr))] overflow-hidden px-[var(--gx)]">
          <SkelRows hero />
          <div className="mt-2 text-base text-muted-foreground">{h.msg}...</div>
        </div>
      )}
      {h.status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div>
          <div className="flex gap-3"><TvButton onClick={h.retry}>Retry</TvButton><TvButton variant="secondary" onClick={h.changeSource}>Change source</TvButton></div></div></Empty>
      )}
      {h.status === "ready" && (
        <div ref={scroller} data-nav-group className="nf-page -mt-[var(--hdr)] !h-[calc(100%+var(--hdr))] [scroll-padding-top:calc(var(--hdr)+1rem)]">
          <div onFocus={() => scroller.current?.scrollTo({ top: 0 })}><Billboard h={h} /></div>
          <div className="nf-under">
            {/* Netflix order: Continue Watching, Trending Now, Top 10, My List, then the rest */}
            {[cont].filter(Boolean).map((r) => railOf(r!))}
            {trending.length > 0 && <Row key="trend" title="Trending Now">{trending.map((i) => <Tile key={i.id} item={i} variant={i.backdrop ? "wide" : "poster"} onOpen={() => h.open(i)} onPlay={() => play(i)} />)}</Row>}
            {topRow}
            {mine.map(railOf)}
            {others.map(railOf)}
          </div>
        </div>
      )}
    </Shell>
  )
}
