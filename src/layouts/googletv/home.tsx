import { useEffect, useRef, useState } from "react"
import { Check, ChevronLeft, ChevronRight, Play, Plus } from "lucide-react"
import { Shell, TvButton, Empty } from "@/components/tv/ui"
import { Card, Pill, Rail, RoundButton, SkelHero, SkelRail } from "@/components/gtv"
import { GameCard, SkelGames } from "@/components/tv/sports"
import { cn } from "@/lib/utils"
import { fmt, useT } from "@/lib/i18n"
import { useHomeData } from "../home-data"
import { useUpcomingGames } from "@/lib/sports/use-games"
import { matchRoute, teamInGame } from "@/lib/sports/games"
import { useFollows } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { GRail, useLeft } from "./parts"

const TITLES: Record<string, string> = { favs: "gtv.home.watchlist", recents: "gtv.home.recents" }

export default function Home() {
  const t = useT()
  const h = useHomeData()
  const left = useLeft()
  const { games, loading: gamesLoading } = useUpcomingGames()
  const follows = useFollows()
  const go = useRoute((s) => s.go)
  const scroller = useRef<HTMLDivElement>(null)
  const [pickId, setPickId] = useState<string | null>(null) // the slide is remembered by title, not by index: favouriting it re-orders `featured` and would swap the title (and remount the focused button)
  const [hold, setHold] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const feat = h.featured
  const count = feat.length
  const n = Math.max(0, feat.findIndex((f) => f.item.id === pickId))
  const slide = (to: number) => { const f = feat[((to % count) + count) % count]; if (f) setPickId(f.item.id) }
  const onTop = useRoute((s) => s.stack[s.stack.length - 1]?.name === "home") // a stacked Home must not change its hero behind the page on top
  // auto-advance every 9s unless motion is off, focus is inside the hero or Home is not the page on top
  useEffect(() => {
    if (count < 2 || hold || !onTop) return
    const t = window.setInterval(() => { if (document.documentElement.dataset.motion !== "off") slide(n + 1) }, 9000)
    return () => window.clearInterval(t)
  }, [count, hold, n, onTop]) // eslint-disable-line react-hooks/exhaustive-deps
  const pick = feat[Math.min(n, feat.length - 1)] ?? h.hero
  const item = pick?.item
  const art = item?.backdrop || item?.logo
  const meta = item ? [item.year && fmt.digits(item.year), item.rating ? `★ ${Number.isFinite(Number(item.rating)) ? fmt.decimal(Number(item.rating)) : item.rating}` : "", item.genres?.slice(0, 3).join(", ") || item.group, item.dur && item.dur > 60 ? (fmt.duration(item.dur)) : ""].filter(Boolean).join("  •  ") : ""
  const fav = !!item && h.isFav(item)

  return (
    <Shell page="home" title={h.sourceName ?? t("gtv.home.forYou")}>
      {h.status === "loading" && (
        <div role="status" className="under-top under-bleed -mx-[var(--gx)] overflow-hidden px-[var(--gx)]">
          <SkelHero />
          <div className="mb-2 text-base text-muted-foreground">{h.msg}...</div>
          <SkelRail variant="wide" />
          <SkelRail />
        </div>
      )}
      {h.status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div>
          <div className="flex gap-3"><TvButton onClick={h.retry}>{t("gtv.home.retry")}</TvButton><TvButton variant="secondary" onClick={h.changeSource}>{t("gtv.home.changeSource")}</TvButton></div></div></Empty>
      )}
      {h.status === "ready" && (
        <div ref={scroller} className="under-top under-bottom under-bleed -mx-[var(--gx)] overflow-y-auto px-[var(--gx)]" style={{ scrollPaddingBottom: "calc(var(--content-b) + 4rem)" }}>
          <section
            onFocus={() => { setHold(true); scroller.current?.scrollTo({ top: 0 }) }}
            onBlur={() => setHold(false)}
            onTouchStart={(e) => { const p = e.touches[0]; touch.current = { x: p.clientX, y: p.clientY }; setHold(true) }}
            onTouchEnd={(e) => {
              setHold(false)
              const s = touch.current
              touch.current = null
              if (!s || count < 2) return
              const p = e.changedTouches[0]
              const dx = p.clientX - s.x, dy = p.clientY - s.y
              if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return // ignore vertical scrolls
              const next = (dx < 0) !== (document.documentElement.dir === "rtl")
              slide(n + (next ? 1 : -1))
            }}
            className="gtv-hero relative -mx-[var(--gx)] mb-4 h-[58vh] min-h-[26rem] overflow-hidden">
            {art && <div key={item!.id} aria-hidden className="m-fade gtv-hero-art absolute inset-y-0 end-0 w-[65%] max-md:w-full max-md:opacity-40"><img src={art} alt="" decoding="async" className="size-full object-cover" /></div>}
            <div aria-hidden className="gtv-hero-fade absolute inset-0" />
            <div aria-hidden className="gtv-hero-fade-b absolute inset-x-0 bottom-0 h-1/3" />
            {item && (
              <div key={item.id} className="m-fade relative flex h-full max-w-[48rem] flex-col justify-end gap-3 px-[var(--gx)] pb-10 pt-[var(--content-t)]">
                <div className="text-sm font-medium tracking-wide text-muted-foreground">{pick!.kicker === t("common.featured") ? t("gtv.home.topPick") : pick!.kicker}</div>
                <h1 dir="auto" className="line-clamp-2 text-3xl font-medium leading-tight tracking-tight md:text-5xl">{item.name}</h1>
                {meta && <div dir="auto" className="text-base text-foreground/80">{meta}</div>}
                {item.plot && <p dir="auto" className="line-clamp-3 max-w-xl text-base text-muted-foreground">{item.plot}</p>}
                <div className="-ms-1 mt-2 flex items-center gap-3 p-1">
                  <Pill variant="primary" onClick={() => h.play(item)}><Play className="fill-current" />{t("gtv.home.watch")}</Pill>
                  <RoundButton label={fav ? t("gtv.home.removeWatchlist") : t("gtv.home.addWatchlist")} active={fav} onClick={() => h.toggleFav(item)}>{fav ? <Check /> : <Plus />}</RoundButton>
                </div>
              </div>
            )}
            {feat.length > 1 && (
              <div data-nav-group className="absolute bottom-3 end-[var(--gx)] hidden items-center gap-1 md:flex">
                <RoundButton label={t("gtv.home.prevFeatured")} onClick={() => slide(n - 1)}><ChevronLeft className="rtl-flip" /></RoundButton>
                {feat.map((f, i) => (
                  <button key={f.item.id} data-nav aria-label={t("gtv.home.featuredN", { n: i + 1 })} aria-current={i === n ? "true" : undefined} onClick={() => slide(i)} className="grid size-11 place-items-center rounded-full">
                    <span className={cn("block h-2.5 rounded-full transition-transform", i === n ? "w-7 bg-foreground" : "w-2.5 bg-foreground/40")} />
                  </button>
                ))}
                <RoundButton label={t("gtv.home.nextFeatured")} onClick={() => slide(n + 1)}><ChevronRight className="rtl-flip" /></RoundButton>
              </div>
            )}
            {!item && <Empty>{t("gtv.home.empty")}</Empty>}
          </section>
          {games.length === 0 && gamesLoading && <SkelGames />}
          {games.length > 0 && (
            <Rail title={t("gtv.home.nextGames")}>
              {games.slice(0, 12).map((g) => {
                const route = matchRoute(follows, g)
                return <GameCard key={g.id} g={g} mineId={teamInGame(follows, g)} onOpen={() => route && go("match", route)} />
              })}
            </Rail>
          )}
          {h.rails.map((r) => (
            <GRail key={r.key} title={TITLES[r.key] ? t(TITLES[r.key]) : r.title} onSeeAll={r.seeAll}>
              {r.items.map((i) => (
                <Card key={i.id} item={i} variant={r.card ?? r.kind} pct={r.pct?.(i)} sub={r.key === "cont" ? left(i) : r.sub?.(i)} onOpen={() => h.open(i, r.items)} />
              ))}
            </GRail>
          ))}
        </div>
      )}
    </Shell>
  )
}
