import { startTransition, useCallback, useEffect, useState } from "react"
import { Play } from "lucide-react"
import { Shell, TvButton, Empty, useCardFlags } from "@/components/tv/ui"
import { Card, Rail, SkelRail, small } from "@/components/gtv"
import { GameCard, SkelGames } from "@/components/tv/sports"
import type { Item } from "@/lib/types"
import { fmt, useT } from "@/lib/i18n"
import { isTv } from "@/lib/device"
import { useHomeData } from "../home-data"
import { useUpcomingGames } from "@/lib/sports/use-games"
import { matchRoute, teamInGame } from "@/lib/sports/games"
import { useFollows } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { GRail, useLeft } from "./parts"

const TITLES: Record<string, string> = { favs: "gtv.home.watchlist" }
/** Rails painted on the first frame; the rest follow in a transition right after (same order, same list). TV paints fewer first: it is the slowest to lay out. */
const FIRST_RAILS = isTv ? 3 : 4

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

export default function Home() {
  const t = useT()
  const h = useHomeData()
  const left = useLeft()
  const { games, loading: gamesLoading } = useUpcomingGames()
  const follows = useFollows()
  const go = useRoute((s) => s.go)
  const feat = h.featured
  const flags = useCardFlags()
  const ready = h.status === "ready"
  const [allRails, setAllRails] = useState(false)
  useEffect(() => {
    if (!ready || allRails) return
    const id = requestAnimationFrame(() => startTransition(() => setAllRails(true))) // after the first paint of the top rails
    return () => cancelAnimationFrame(id)
  }, [ready, allRails])
  const rails = allRails ? h.rails : h.rails.slice(0, FIRST_RAILS)
  const meta = (item: Item) => [item.year && fmt.digits(item.year), item.rating ? `★ ${Number.isFinite(Number(item.rating)) ? fmt.decimal(Number(item.rating)) : item.rating}` : "", item.genres?.slice(0, 2).join(", ") || item.group, item.dur && item.dur > 60 ? fmt.duration(item.dur) : ""].filter(Boolean).join("  •  ")

  return (
    <Shell page="home" title={h.sourceName ?? t("gtv.home.forYou")}>
      {h.status === "loading" && (
        <div role="status" className="under-top -mx-[var(--gx)] overflow-hidden px-[var(--gx)]">
          <div className="mb-2 text-base text-muted-foreground">{h.msg}...</div>
          <SkelRail variant="wide" n={4} title={false} />
          <SkelRail />
        </div>
      )}
      {h.status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div>
          <div className="flex gap-3"><TvButton onClick={h.retry}>{t("gtv.home.retry")}</TvButton><TvButton variant="secondary" onClick={h.changeSource}>{t("gtv.home.changeSource")}</TvButton></div></div></Empty>
      )}
      {h.status === "ready" && (
        <div className="under-top under-bottom -mx-[var(--gx)] overflow-y-auto px-[var(--gx)]" style={{ scrollPaddingBottom: "calc(var(--content-b) + 4rem)" }}>
          {/* spotlight: a snapping row of banner cards (replaces the full-screen hero); a tap plays / opens like the old Watch button */}
          {feat.length > 0 && (
            <Rail className="mb-4 [&>.rail]:snap-x [&>.rail]:snap-mandatory">
              {feat.map(({ item, kicker }, i) => {
                const art = small(item.backdrop) || item.logo
                const m = meta(item)
                return (
                  <button key={item.id} data-nav data-card onClick={() => h.play(item)} className="w-[86vw] shrink-0 snap-start text-start md:w-[44vw] xl:w-[36vw]">
                    <div data-tilewrap className="relative rounded-3xl">
                    <div data-tile className="relative aspect-[2/1] overflow-hidden rounded-[inherit] bg-gradient-to-br from-accent-blue-container via-surface to-surface">
                      {art && <img src={art} alt="" decoding="async" loading={i ? "lazy" : undefined} className="absolute inset-0 size-full object-cover" />}
                      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                      <span aria-hidden className="absolute end-3 top-3 grid size-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md"><Play className="size-5 fill-current" /></span>
                      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 md:p-6">
                        <span className="text-xs font-semibold uppercase tracking-wider text-white/75">{kicker === t("common.featured") ? t("gtv.home.topPick") : kicker}</span>
                        <span dir="auto" className="line-clamp-2 text-xl font-medium leading-tight text-white md:text-3xl">{item.name}</span>
                        {m && <span dir="auto" className="truncate text-sm text-white/80">{m}</span>}
                      </div>
                    </div>
                    <span data-ring aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" />
                    </div>
                  </button>
                )
              })}
            </Rail>
          )}
          {!feat.length && !h.rails.some((r) => r.items.length) && <Empty>{t("gtv.home.empty")}</Empty>}
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
            <CardRail key={r.key} title={TITLES[r.key] ? t(TITLES[r.key]) : r.title} onSeeAll={r.seeAll} items={r.items} variant={r.card ?? r.kind} pct={r.pct} sub={r.key === "cont" ? left : (i) => r.sub?.(i)} open={h.open} flags={flags} />
          ))}
        </div>
      )}
    </Shell>
  )
}
