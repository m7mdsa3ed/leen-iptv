import { useMemo, useRef } from "react"
import { Info, Play, Star } from "lucide-react"
import { Empty, Pending, Shell, TvButton } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { fmt, useT } from "@/lib/i18n"
import { useHomeData } from "../home-data"
import { Row, Tile } from "./ui"

type H = ReturnType<typeof useHomeData>
const rating = (r?: string) => { const n = parseFloat(r ?? ""); return n > 0 && n <= 10 ? n : 0 }

/** Compact featured hero (~40% of the screen): backdrop on the end side fading into the page, title, chips, Play + More info. */
function Hero({ h }: { h: H }) {
  const t = useT()
  if (!h.hero) return <Empty>{t("pv.home.empty")}</Empty>
  const { item } = h.hero
  const src = item.backdrop ?? item.logo
  const r = rating(item.rating)
  const chips = [item.year && fmt.digits(item.year), item.group, ...(item.genres?.slice(0, 2) ?? [])].filter(Boolean) as string[]
  return (
    <section className="pv-hero">
      {src && <img src={src} alt="" aria-hidden decoding="async" className="pv-hero-img" />}
      <div aria-hidden className="pv-hero-fade" />
      <div className="pv-hero-body m-fade">
        <h2 dir="auto" className="line-clamp-2 text-[clamp(1.6rem,3vw,2.6rem)] font-extrabold leading-tight tracking-tight">{item.name}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {r > 0 && <span className="pv-chip pv-rate"><Star className="size-3.5 fill-current" />{fmt.decimal(r)}</span>}
          {chips.map((c) => <span key={c} dir="auto" className="pv-chip pv-meta">{c}</span>)}
        </div>
        {item.plot ? <p dir="auto" className="line-clamp-2 text-sm text-[var(--fg-80)] md:text-base">{item.plot}</p> : null}
        <div className="mt-1 flex flex-wrap gap-3">
          <button data-nav data-autofocus="" onClick={() => h.play(item)} className="pv-btn pv-pri"><Play className="fill-current" />{t("common.play")}</button>
          {item.kind !== "live" && <button data-nav onClick={() => h.info(item)} className="pv-btn pv-sec"><Info />{t("common.moreInfo")}</button>}
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const t = useT()
  const h = useHomeData()
  const scroller = useRef<HTMLDivElement>(null)
  const byKind = useCatalog((s) => s.byKind)
  const recent = useMemo(() => [...byKind.movie.slice(-12), ...byKind.series.slice(-12)].reverse(), [byKind]) // catalog order, last = newest
  const top = useMemo(() => [...byKind.movie, ...byKind.series].filter((i) => rating(i.rating) > 0).sort((a, b) => rating(b.rating) - rating(a.rating)).slice(0, 20), [byKind])
  const railOf = (r: (typeof h.rails)[number]) => (
    <Row key={r.key} title={r.key === "favs" ? t("common.favorites") : r.title} onSeeAll={r.seeAll}>
      {r.items.map((i) => <Tile key={i.id} item={i} pct={r.pct?.(i)} sub={r.sub?.(i)} onOpen={() => h.open(i, r.items)} />)}
    </Row>
  )
  const plain = (key: string, title: string, items: typeof recent) => items.length > 0 && <Row key={key} title={title}>{items.map((i) => <Tile key={i.id} item={i} onOpen={() => h.open(i)} />)}</Row>
  const cont = h.rails.filter((r) => r.key === "cont")
  const rest = h.rails.filter((r) => r.key !== "cont")
  return (
    <Shell page="home" title={h.sourceName ?? t("nav.home")}>
      {h.status === "loading" && <><Pending /><div className="mt-2 text-base text-muted-foreground">{h.msg}...</div></>}
      {h.status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div>
          <div className="flex gap-3"><TvButton onClick={h.retry}>{t("common.retry")}</TvButton><TvButton variant="secondary" onClick={h.changeSource}>{t("pv.shell.sources")}</TvButton></div></div></Empty>
      )}
      {h.status === "ready" && (
        <div ref={scroller} data-nav-group className="pv-page">
          <div onFocus={() => scroller.current?.scrollTo({ top: 0 })}><Hero h={h} /></div>
          {cont.map(railOf)}
          {plain("recent", t("pv.home.recent"), recent)}
          {plain("top", t("pv.home.top"), top)}
          {rest.map(railOf)}
        </div>
      )}
    </Shell>
  )
}
