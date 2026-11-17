import { startTransition, useCallback, useEffect, useState } from "react"
import { Clapperboard, Film, Tv } from "lucide-react"
import { Shell, TvButton, Empty, useCardFlags } from "@/components/tv/ui"
import { Card, Pill, Rail, SkelRail } from "@/components/gtv"
import { GameCard, SkelGames } from "@/components/tv/sports"
import type { Item } from "@/lib/types"
import { useT } from "@/lib/i18n"
import { isTv } from "@/lib/device"
import { useHomeData } from "../home-data"
import { useUpcomingGames } from "@/lib/sports/use-games"
import { matchRoute, teamInGame } from "@/lib/sports/games"
import { useFollows } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { GRail, useLeft } from "./parts"
import { SkelStage, Stage } from "./stage"

/** Rails painted on the first frame; the rest follow in a transition right after (same order, same list). TV paints fewer first: it is the slowest to lay out. */
const FIRST_RAILS = isTv ? 2 : 4

type Flags = ReturnType<typeof useCardFlags>
/** One rail: the opener is stable per rail (item + the rail as zapping queue), so memoised Cards skip re-rendering. Cards are GRail's direct children (it stages them on TV). */
function CardRail({ title, onSeeAll, items, variant, pct, sub, open, flags }: { title: string; onSeeAll?: () => void; items: Item[]; variant: "wide" | "poster"; pct?: (i: Item) => number | undefined; sub: (i: Item) => string | undefined; open: (i: Item, from?: Item[]) => void; flags: Flags }) {
  const onOpen = useCallback((i: Item) => open(i, items), [open, items])
  return (
    <GRail title={title} onSeeAll={onSeeAll}>
      {items.map((i) => <Card key={i.id} item={i} variant={variant} pct={pct?.(i)} sub={sub(i)} onOpen={onOpen} fav={flags.fav(i)} locked={flags.locked(i)} badge={flags.badge} />)}
    </GRail>
  )
}

/** Nothing watched or saved yet and no picks: point at the three places to start. */
function Welcome() {
  const t = useT()
  const go = useRoute((s) => s.reset)
  return (
    <div className="m-rise mx-auto flex max-w-xl flex-col items-center gap-5 py-[12vh] text-center">
      <h2 className="text-3xl font-semibold tracking-tight">{t("gtv.home.welcome")}</h2>
      <p className="text-base text-muted-foreground">{t("gtv.home.empty")}</p>
      <div data-nav-group className="flex flex-wrap justify-center gap-3">
        <Pill variant="primary" data-autofocus onClick={() => go("live")}><Tv />{t("nav.live")}</Pill>
        <Pill onClick={() => go("movies")}><Film />{t("nav.movies")}</Pill>
        <Pill onClick={() => go("series")}><Clapperboard />{t("nav.shows")}</Pill>
      </div>
    </div>
  )
}

export default function Home() {
  const t = useT()
  const h = useHomeData()
  const left = useLeft()
  const { games, loading: gamesLoading } = useUpcomingGames()
  const follows = useFollows()
  const go = useRoute((s) => s.go)
  const flags = useCardFlags()
  const ready = h.status === "ready"
  const [allRails, setAllRails] = useState(false)
  useEffect(() => {
    if (!ready || allRails) return
    const id = requestAnimationFrame(() => startTransition(() => setAllRails(true))) // after the first paint of the stage and the top rails
    return () => cancelAnimationFrame(id)
  }, [ready, allRails])
  const rails = allRails ? h.rails : h.rails.slice(0, FIRST_RAILS)
  const empty = !h.featured.length && !h.rails.some((r) => r.items.length)

  return (
    <Shell page="home" title={h.sourceName ?? t("gtv.home.forYou")}>
      {h.status === "loading" && (
        <div role="status" aria-label={h.msg} className="under-top under-bleed -ms-[var(--gs)] -me-[var(--gx)] overflow-hidden ps-[var(--gs)] pe-[var(--gx)]">
          <SkelStage />
          <SkelRail variant="wide" n={6} />
          <div className="sr-only">{h.msg}</div>
        </div>
      )}
      {h.status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div>
          <div className="flex gap-3"><TvButton onClick={h.retry}>{t("gtv.home.retry")}</TvButton><TvButton variant="secondary" onClick={h.changeSource}>{t("gtv.home.changeSource")}</TvButton></div></div></Empty>
      )}
      {ready && (
        <div className="under-top under-bleed under-bottom -ms-[var(--gs)] -me-[var(--gx)] overflow-y-auto ps-[var(--gs)] pe-[var(--gx)]">
          {empty ? <div className="pt-[var(--content-t)]"><Welcome /></div> : <Stage picks={h.featured} watch={h.watch} info={h.info} isFav={h.isFav} toggleFav={h.toggleFav} />}
          {rails.map((r) => r.key === "games" ? (
            games.length > 0 ? (
              <Rail key="games" title={t("gtv.home.nextGames")}>
                {games.slice(0, isTv ? 9 : 12).map((g) => {
                  const route = matchRoute(follows, g)
                  return <GameCard key={g.id} g={g} mineId={teamInGame(follows, g)} onOpen={() => route && go("match", route)} />
                })}
              </Rail>
            ) : gamesLoading ? <SkelGames key="games" /> : null
          ) : (
            <CardRail key={r.key} title={r.title} onSeeAll={r.seeAll} items={r.items} variant={r.card ?? r.kind} pct={r.pct} sub={r.pct ? left : (i) => r.sub?.(i)} open={h.open} flags={flags} />
          ))}
        </div>
      )}
    </Shell>
  )
}
