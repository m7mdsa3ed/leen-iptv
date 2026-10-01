import { useEffect, useMemo, useRef, useState } from "react"
import { Shell, TvButton, useOpen, Empty } from "@/components/tv/ui"
import { Card, Hero, Rail, SkelHero, SkelRail } from "@/components/gtv"
import { hm, nowNext, useCatalog } from "@/lib/catalog"
import { usePData, useApp, useSource } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import type { Item, Kind } from "@/lib/types"

const CAP = 20

type Focus = { item: Item; kicker: string }

/** The hero follows rail focus. State lives here, not in Home, so moving focus re-renders only the hero (not ~300 cards). */
function HeroSlot({ base, bind, queue }: { base: Focus | undefined; bind: React.MutableRefObject<((f: Focus) => void) | null>; queue: Item[] }) {
  const [f, setF] = useState<Focus | undefined>(base)
  const timer = useRef(0)
  const open = useOpen()
  const toggleFav = useApp((s) => s.toggleFav)
  const favs = usePData().favs
  useEffect(() => setF(base), [base])
  useEffect(() => {
    // small delay: holding an arrow key sweeps across many cards, only the one you stop on should load
    bind.current = (n) => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setF(n), 150) }
    return () => { bind.current = null; clearTimeout(timer.current) }
  }, [bind])
  const item = f?.item
  return (
    <Hero
      item={item}
      kicker={f?.kicker}
      isFav={!!item && favs.includes(item.id)}
      onPlay={() => item && open(item, queue)}
      onInfo={item && item.kind !== "live" ? () => open(item) : undefined}
      onFav={() => item && toggleFav(item.id)}
    >
      {!item && <Empty>Pick Live TV, Movies or Series to start. Favorites and history show up here.</Empty>}
    </Hero>
  )
}

export default function Home() {
  const status = useCatalog((s) => s.status)
  const msg = useCatalog((s) => s.msg)
  const byId = useCatalog((s) => s.byId)
  const byKind = useCatalog((s) => s.byKind)
  const groups = useCatalog((s) => s.groups)
  const epg = useCatalog((s) => s.epg)
  useCatalog((s) => s.epgTick)
  const scroller = useRef<HTMLDivElement>(null)
  const d = usePData()
  const src = useSource()
  const go = useRoute((s) => s.go)
  const open = useOpen()
  const proxy = useApp((s) => s.settings.proxy)

  const { cont, favs, recents, genres, live } = useMemo(() => {
    const get = (ids: string[]) => ids.map((i) => byId.get(i)).filter(Boolean).slice(0, CAP) as Item[]
    const p = Object.entries(d.progress).filter(([, v]) => v.dur > 0 && v.pos / v.dur < 0.95 && v.pos > 30).sort((a, b) => b[1].t - a[1].t).map(([k]) => k)
    const genre = (k: Kind) => {
      const first = groups[k].slice(0, 6)
      const m = new Map<string, Item[]>(first.map((g) => [g, []]))
      for (const i of byKind[k]) { const l = m.get(i.group); if (l && l.length < CAP) l.push(i) }
      return first.map((g) => ({ k, g, items: m.get(g)! })).filter((r) => r.items.length)
    }
    return { cont: get(p), favs: get(d.favs), recents: get(d.recents), live: byKind.live.slice(0, CAP), genres: [...genre("movie"), ...genre("series")] }
  }, [d, byId, byKind, groups])

  // hero: last continue-watching, else a favorite, else a day-stable VOD pick, else first channel
  const hero = useMemo(() => {
    const vod = [...byKind.movie, ...byKind.series]
    return cont[0] ?? favs[0] ?? (vod.length ? vod[Math.floor(Date.now() / 864e5) % vod.length] : undefined) ?? byKind.live[0]
  }, [cont, favs, byKind])

  const heroBind = useRef<((f: Focus) => void) | null>(null)
  const base = useMemo<Focus | undefined>(() => (hero ? { item: hero, kicker: cont[0] === hero ? "Continue watching" : favs[0] === hero ? "Favorite" : "Featured" } : undefined), [hero, cont, favs])
  const pct = (i: Item) => { const p = d.progress[i.id]; return p ? (p.pos / p.dur) * 100 : undefined }
  const liveQ = live
  const track = (i: Item, kicker: string) => () => heroBind.current?.({ item: i, kicker })
  const wide = (items: Item[], kicker: string, showPct?: boolean) => items.map((i) => (
    <Card key={i.id} item={i} variant="wide" pct={showPct ? pct(i) : undefined} onOpen={() => open(i, items.filter((x) => x.kind === "live"))} onFocus={track(i, kicker)} />
  ))
  const poster = (items: Item[], kicker: string) => items.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} onFocus={track(i, kicker)} />)
  const sub = (i: Item) => { const n = nowNext(epg, i.epgId).now; return n ? `${hm(n.s)} ${n.t}` : undefined }

  return (
    <Shell page="home" title={src?.name ?? "Home"}>
      {status === "loading" && (
        <div role="status" className="-mx-[var(--gx)] -mt-[var(--hdr)] h-[calc(100%+var(--hdr))] overflow-hidden px-[var(--gx)]">
          <SkelHero />
          <div className="mb-2 text-base text-muted-foreground">{msg}...</div>
          <SkelRail variant="wide" />
          <SkelRail />
        </div>
      )}
      {status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{msg}</div>
          <div className="flex gap-3"><TvButton onClick={() => src && useCatalog.getState().load(src, proxy, true)}>Retry</TvButton><TvButton variant="secondary" onClick={() => go("sources")}>Change source</TvButton></div></div></Empty>
      )}
      {status === "ready" && (
        <div ref={scroller} className="-mx-[var(--gx)] -mt-[var(--hdr)] h-[calc(100%+var(--hdr))] overflow-y-auto px-[var(--gx)] [scroll-padding-top:calc(var(--hdr)+1rem)] [scroll-padding-bottom:4rem]">
          <div onFocus={() => scroller.current?.scrollTo({ top: 0 })}>
          <HeroSlot base={base} bind={heroBind} queue={liveQ} />
          </div>
          {cont.length > 0 && <Rail title="Continue watching">{wide(cont, "Continue watching", true)}</Rail>}
          {favs.length > 0 && <Rail title="Favorites">{wide(favs, "Favorite")}</Rail>}
          {recents.length > 0 && <Rail title="Recently watched">{wide(recents, "Recently watched")}</Rail>}
          {live.length > 0 && (
            <Rail title="Live now">
              {live.map((i) => <Card key={i.id} item={i} variant="wide" sub={sub(i)} onOpen={() => open(i, liveQ)} onFocus={track(i, "Live now")} />)}
            </Rail>
          )}
          {genres.map((r) => <Rail key={r.k + r.g} title={`${r.k === "movie" ? "Movies" : "Series"} · ${r.g}`} onSeeAll={() => go("category", { id: `${r.k}|${r.g}` })}>{poster(r.items, `${r.k === "movie" ? "Movies" : "Series"} · ${r.g}`)}</Rail>)}
        </div>
      )}
    </Shell>
  )
}
