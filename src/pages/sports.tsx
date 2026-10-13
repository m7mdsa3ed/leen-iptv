import { useMemo, useRef, useState } from "react"
import { ChevronRight, Plus, RefreshCw, Search, Star, Trophy, X } from "lucide-react"
import { Pill, Rail } from "@/components/gtv"
import { GameCard, GameRow, SkelGames, TeamBadge } from "@/components/tv/sports"
import { Shell } from "@/components/tv/ui"
import { useApp, useFollows } from "@/lib/store"
import { useDayGames, useSportsSearch, useUpcomingGames } from "@/lib/sports/use-games"
import { leagueIdOf, matchIdOf, matchRoute, sportOf, teamInGame } from "@/lib/sports/games"
import { LEAGUES, SPORTS, competitionId, refFor, sameDay, teamKey } from "@/lib/sports/pure"
import { useRoute } from "@/lib/nav"
import { openSection } from "@/settings/open"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Follow, SportsGame } from "@/lib/api"

const DAY = 864e5
const DAYS_BACK = 3, DAYS_FWD = 7 // the day strip

/** Sports tab: search any team or tournament, your teams, live now, then one day of games (yours or every popular league), grouped by competition. */
export default function Sports() {
  const t = useT()
  const follows = useFollows()
  const toggleFollow = useApp((s) => s.toggleFollow)
  const go = useRoute((s) => s.go)
  const S = useSportsSearch()
  const searchRef = useRef<HTMLInputElement>(null)
  const today = useMemo(() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime() }, []) // noon: DST-safe day steps
  const [day, setDay] = useState(today)
  const [scope, setScope] = useState<"mine" | "all">(follows.length ? "mine" : "all")
  const [sport, setSport] = useState<string>("all")

  const mineGames = useUpcomingGames(DAYS_FWD + 1, DAYS_BACK + 1)
  const followedLeagues = follows.filter((f) => f.kind === "league").map((f) => f.teamId)
  const allIds = useMemo(() => {
    const base = LEAGUES.filter((l) => (sport === "all" ? l.top : l.sport === sport)).map(competitionId)
    return [...new Set([...base, ...followedLeagues.filter((id) => sport === "all" || sportOf(id) === sport)])]
  }, [sport, followedLeagues.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps
  const allGames = useDayGames(allIds, day, scope === "all")

  const isMine = (id: string) => follows.some((f) => f.kind !== "league" && teamKey(f.teamId) === teamKey(id))
  const pool = scope === "mine" ? mineGames.games.filter((g) => sameDay(g.startMs, day)) : allGames.games
  const games = sport === "all" ? pool : pool.filter((g) => sportOf(g.home.id) === sport)
  const loading = scope === "mine" ? mineGames.loading : allGames.loading
  const liveMine = mineGames.games.filter((g) => g.status === "live")
  const sportsHere = scope === "mine" ? [...new Set([...follows.map((f) => sportOf(f.teamId))])].filter((s) => (SPORTS as readonly string[]).includes(s)) : [...SPORTS]

  // games grouped by competition, the ones with a followed team or a followed league first
  const groups = useMemo(() => {
    const m = new Map<string, SportsGame[]>()
    for (const g of games) { const k = leagueIdOf(g); m.set(k, [...(m.get(k) ?? []), g]) }
    const score = (id: string, gs: SportsGame[]) => (followedLeagues.includes(id) || gs.some((g) => isMine(g.home.id) || isMine(g.away.id)) ? 0 : 1) * 1000 + LEAGUES.findIndex((l) => competitionId(l) === id)
    return [...m.entries()].sort((a, b) => score(a[0], a[1]) - score(b[0], b[1]))
  }, [games]) // eslint-disable-line react-hooks/exhaustive-deps

  const openGame = (g: SportsGame) => { const r = matchRoute(follows, g); go("match", r ?? { id: matchIdOf(allGames.provider || "espn", g) }) }
  const openFollow = (f: Follow) => f.kind === "league"
    ? go("league", { id: `${f.provider}~${f.teamId}`, name: f.name })
    : go("team", { id: `${f.provider}~${f.teamId}`, name: f.name, badge: f.badge, league: f.league })
  const followed = (provider: string, id: string, kind: "team" | "league") => follows.some((f) => f.provider === provider && f.teamId === id && (kind === "league" ? f.kind === "league" : f.kind !== "league"))
  const dayLabel = (ms: number) => sameDay(ms, today) ? t("pages.sports.today") : sameDay(ms, today - DAY) ? t("pages.sports.yesterday") : sameDay(ms, today + DAY) ? t("pages.sports.tomorrow") : fmt.date(ms, { weekday: "short" })
  const chip = (on: boolean) => cn("min-h-10 shrink-0 rounded-full px-4 text-sm font-medium", on ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground")

  const star = (on: boolean, label: string, onClick: () => void) => (
    <button data-nav data-pill aria-pressed={on} aria-label={label} onClick={onClick} className={cn("grid size-10 shrink-0 place-items-center rounded-full", on ? "text-amber-500" : "text-muted-foreground")}>
      <Star className={cn("size-5", on && "fill-current")} />
    </button>
  )
  const results = S.teams || S.comps ? (
    <section className="flex flex-col gap-1 rounded-3xl bg-surface p-2">
      {S.teams?.length === 0 && S.comps?.length === 0 && <p className="p-4 text-center text-muted-foreground">{t("settings.sports.noResults")}</p>}
      {!!S.comps?.length && <h3 className="px-3 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("settings.sports.tournaments")}</h3>}
      {S.comps?.slice(0, 8).map((c) => (
        <div key={c.id} data-nav-group className="flex items-center gap-1">
          <button data-nav data-pill onClick={() => go("league", { id: `${S.provider}~${c.id}`, name: c.name })} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-start">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2"><Trophy className="size-4" /></span>
            <span className="min-w-0"><span dir="auto" className="block truncate">{c.name}</span><span className="block text-xs text-muted-foreground">{t(`pages.sports.sport.${sportOf(c.id)}`)}</span></span>
          </button>
          {star(followed(S.provider, c.id, "league"), t(followed(S.provider, c.id, "league") ? "pages.team.unfollow" : "pages.team.follow"), () => toggleFollow({ provider: S.provider, teamId: c.id, name: c.name, league: c.league, kind: "league" }))}
        </div>
      ))}
      {!!S.teams?.length && <h3 className="px-3 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("settings.sports.teams")}</h3>}
      {S.teams?.slice(0, 12).map((tm) => (
        <div key={tm.id} data-nav-group className="flex items-center gap-1">
          <button data-nav data-pill onClick={() => go("team", { id: `${S.provider}~${tm.id}`, name: tm.name, badge: tm.badge, league: tm.league })} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-start">
            <TeamBadge team={tm} className="size-8" />
            <span className="min-w-0"><span dir="auto" className="block truncate">{tm.name}</span><span dir="auto" className="block truncate text-xs text-muted-foreground">{[tm.league, tm.women ? t("settings.sports.hint.women") : ""].filter(Boolean).join("  ·  ")}</span></span>
          </button>
          {star(followed(S.provider, tm.id, "team"), t(followed(S.provider, tm.id, "team") ? "pages.team.unfollow" : "pages.team.follow"), () => toggleFollow({ provider: S.provider, teamId: tm.id, name: tm.name, badge: tm.badge, league: tm.league }))}
        </div>
      ))}
    </section>
  ) : null

  return (
    <Shell page="sports" title={t("pages.sports.title")}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pt-1">
        {/* search: any team or tournament */}
        <div className="flex items-center gap-2">
          <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-surface-2 pe-1 ps-4 focus-within:ring-2 focus-within:ring-[var(--ring)]">
            <Search className="size-5 shrink-0 text-muted-foreground" />
            <input ref={searchRef} data-nav dir="auto" type="search" enterKeyHint="search" autoComplete="off" value={S.q} onChange={(e) => S.setQ(e.target.value)} placeholder={t("pages.sports.searchPh")}
              style={{ outline: "none", boxShadow: "none" }} className="h-full min-w-0 flex-1 bg-transparent text-base placeholder:text-muted-foreground [html[data-mode=mobile]_&]:text-[16px] [&::-webkit-search-cancel-button]:hidden" />
            {S.busy && <RefreshCw className="size-4 shrink-0 animate-spin text-muted-foreground" />}
            {S.q && <button data-nav data-pill aria-label={t("search.clear")} onClick={() => S.setQ("")} className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground"><X className="size-5" /></button>}
          </div>
          <button data-nav data-pill aria-label={t("pages.sports.refresh")} onClick={() => void mineGames.refresh()} className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2 text-muted-foreground"><RefreshCw className="size-5" /></button>
        </div>
        {S.err && <p role="alert" className="text-sm text-destructive">{S.err}</p>}
        {results}

        {/* my teams and tournaments */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-medium">{t("pages.sports.myTeams")}</h2>
            <button data-nav data-pill onClick={() => openSection("sports")} className="flex items-center gap-1 rounded-full px-3 py-1 text-sm text-muted-foreground">{t("pages.sports.manage")}<ChevronRight className="rtl-flip size-4" /></button>
          </div>
          <div data-nav-group className="no-scrollbar -mx-[var(--gx)] flex gap-3 overflow-x-auto px-[var(--gx)] py-1">
            {follows.map((f) => (
              <button key={`${f.provider}:${f.teamId}`} data-nav data-pill onClick={() => openFollow(f)} className="flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-2xl p-1.5 text-center">
                {f.kind === "league"
                  ? <span className="grid size-14 place-items-center rounded-2xl bg-accent-blue-container"><Trophy className="size-6" /></span>
                  : <span className="grid size-14 place-items-center rounded-full bg-surface-2"><TeamBadge team={{ name: f.name, badge: f.badge }} className="size-10" /></span>}
                <span dir="auto" className="line-clamp-2 w-full text-xs leading-tight">{f.name}</span>
              </button>
            ))}
            <button data-nav data-pill onClick={() => searchRef.current?.focus()} className="flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-2xl p-1.5 text-center text-muted-foreground">
              <span className="grid size-14 place-items-center rounded-full border-2 border-dashed border-[var(--fg-30)]"><Plus className="size-6" /></span>
              <span className="text-xs leading-tight">{t("pages.sports.add")}</span>
            </button>
          </div>
        </section>

        {liveMine.length > 0 && (
          <Rail title={t("pages.sports.live")}>
            {liveMine.map((g) => <GameCard key={g.id} g={g} mineId={teamInGame(follows, g)} onOpen={() => openGame(g)} />)}
          </Rail>
        )}

        {/* day strip */}
        <div data-nav-group className="no-scrollbar -mx-[var(--gx)] flex gap-2 overflow-x-auto px-[var(--gx)] py-1">
          {Array.from({ length: DAYS_BACK + DAYS_FWD + 1 }, (_, i) => today + (i - DAYS_BACK) * DAY).map((d) => (
            <button key={d} data-nav data-pill aria-pressed={sameDay(d, day)} data-autofocus={sameDay(d, day) ? "" : undefined} onClick={() => setDay(d)}
              className={cn("flex min-w-16 shrink-0 flex-col items-center rounded-2xl px-3 py-2", sameDay(d, day) ? "bg-foreground text-background" : "bg-surface-2")}>
              <span className={cn("text-xs", !sameDay(d, day) && "text-muted-foreground")}>{dayLabel(d)}</span>
              <span className="text-lg font-semibold tabular-nums">{fmt.date(d, { day: "numeric" })}</span>
            </button>
          ))}
        </div>

        {/* scope + sport */}
        <div data-nav-group className="no-scrollbar -mx-[var(--gx)] flex items-center gap-2 overflow-x-auto px-[var(--gx)] py-1">
          <button data-nav data-pill aria-pressed={scope === "mine"} onClick={() => setScope("mine")} className={chip(scope === "mine")}><Star className={cn("me-1.5 inline size-4", scope === "mine" && "fill-current")} />{t("pages.sports.following")}</button>
          <button data-nav data-pill aria-pressed={scope === "all"} onClick={() => setScope("all")} className={chip(scope === "all")}>{t("pages.sports.allGames")}</button>
          <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-[var(--fg-10)]" />
          <button data-nav data-pill aria-pressed={sport === "all"} onClick={() => setSport("all")} className={chip(sport === "all")}>{t("pages.sports.allSports")}</button>
          {sportsHere.map((s) => <button key={s} data-nav data-pill aria-pressed={sport === s} onClick={() => setSport(s)} className={chip(sport === s)}>{t(`pages.sports.sport.${s}`)}</button>)}
        </div>

        {/* the day's games by competition */}
        {scope === "mine" && !follows.length ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-surface-2 p-8 text-center">
            <p className="max-w-md text-muted-foreground">{t("pages.sports.none")}</p>
            <div className="flex flex-wrap justify-center gap-2"><Pill variant="primary" onClick={() => searchRef.current?.focus()}>{t("pages.sports.addTeams")}</Pill><Pill onClick={() => setScope("all")}>{t("pages.sports.allGames")}</Pill></div>
          </div>
        ) : loading && !games.length ? (
          <div role="status" aria-label={t("pages.team.loading")}><SkelGames title={false} /></div>
        ) : !groups.length ? (
          <p className="rounded-3xl bg-surface-2 p-8 text-center text-muted-foreground">{t(scope === "mine" ? "pages.sports.noGamesMine" : "pages.sports.noGamesDay")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(([lid, gs]) => {
              const [sp, lg] = lid.split("/")
              const name = gs[0]?.league || refFor(sp, lg).name
              const fav = followedLeagues.includes(lid)
              return (
                <section key={lid} className="overflow-hidden rounded-3xl bg-surface-2">
                  <button data-nav data-pill onClick={() => go("league", { id: `${allGames.provider || "espn"}~${lid}`, name })} className="flex w-full items-center gap-2 px-4 py-3 text-start">
                    <Trophy className="size-4 shrink-0 text-muted-foreground" />
                    <span dir="auto" className="min-w-0 flex-1 truncate font-semibold">{name}</span>
                    {fav && <Star aria-hidden className="size-4 shrink-0 fill-current text-amber-500" />}
                    <span className="text-sm tabular-nums text-muted-foreground">{fmt.number(gs.length)}</span>
                    <ChevronRight className="rtl-flip size-4 shrink-0 text-muted-foreground" />
                  </button>
                  <div data-nav-group className="flex flex-col gap-0.5 px-1.5 pb-1.5">{gs.map((g) => <GameRow key={g.id} g={g} mine={isMine} onOpen={() => openGame(g)} />)}</div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </Shell>
  )
}
