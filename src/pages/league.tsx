import { Shell } from "@/components/tv/ui"
import { useEffect, useState } from "react"
import { ArrowLeft, Check, Plus, Trophy } from "lucide-react"
import { Pill, RoundButton } from "@/components/gtv"
import { GameRow, StandingsTable } from "@/components/tv/sports"
import { SPORTS_PROVIDERS, type SportsGame, type StandingGroup } from "@/lib/api"
import { useApp, useFollows } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { refFor, teamKey } from "@/lib/sports/pure"
import { matchIdOf } from "@/lib/sports/games"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const BACK = 21 * 864e5, FWD = 21 * 864e5 // results / fixtures window

/** A tournament: its fixtures and results, and its table(s). Route `id` = `${provider}~${sport}/${league}`; `name` rides along for a first paint. */
export default function LeaguePage({ id, name }: { id?: string; name?: string }) {
  const t = useT()
  const back = useRoute((s) => s.back)
  const go = useRoute((s) => s.go)
  const follows = useFollows()
  const toggleFollow = useApp((s) => s.toggleFollow)
  const proxy = useApp((s) => s.settings.proxy)
  const [provider, leagueId = ""] = String(id ?? "").split("~")
  const [sport, league] = leagueId.split("/")
  const prov = SPORTS_PROVIDERS.find((p) => p.id === provider)
  const follow = follows.find((f) => f.provider === provider && f.teamId === leagueId && f.kind === "league")
  const [tab, setTab] = useState<"matches" | "table">("matches")
  const [games, setGames] = useState<SportsGame[] | null>(null)
  const [table, setTable] = useState<StandingGroup[] | null>(null)
  const [err, setErr] = useState(false)
  const cfg = { id: provider, enabled: true, proxy }

  useEffect(() => {
    if (!prov?.competitionGames || !sport || !league) return
    let live = true
    setGames(null); setErr(false)
    const now = Date.now()
    prov.competitionGames([leagueId], now - BACK, now + FWD, cfg).then((g) => live && setGames(g), () => live && (setErr(true), setGames([])))
    return () => { live = false }
  }, [provider, leagueId, proxy]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!prov?.standings || !sport || !league) return
    let live = true
    setTable(null)
    prov.standings(leagueId, cfg).then((g) => live && setTable(g), () => live && setTable([]))
    return () => { live = false }
  }, [provider, leagueId, proxy]) // eslint-disable-line react-hooks/exhaustive-deps

  const title = name ?? follow?.name ?? (sport && league ? refFor(sport, league).name : leagueId)
  const mine = (tid: string) => follows.some((f) => f.kind !== "league" && teamKey(f.teamId) === teamKey(tid))
  const open = (g: SportsGame) => go("match", { id: matchIdOf(provider, g) })
  const live = (games ?? []).filter((g) => g.status === "live")
  const upcoming = (games ?? []).filter((g) => g.status === "scheduled")
  const results = (games ?? []).filter((g) => g.status === "final").sort((a, b) => b.startMs - a.startMs)
  const list = (head: string, gs: SportsGame[]) => gs.length > 0 && (
    <section className="mt-6">
      <h2 className="mb-2 flex items-baseline gap-2 text-lg font-medium">{head}<span className="text-sm text-muted-foreground">{fmt.number(gs.length)}</span></h2>
      <div data-nav-group className="flex flex-col gap-0.5 rounded-2xl bg-surface-2 p-1.5">{gs.map((g) => <GameRow key={g.id} g={g} date mine={mine} onOpen={() => open(g)} />)}</div>
    </section>
  )

  return (
    <Shell page="sports" title={title} sub>
    <div className="under-top under-bottom relative -mx-[var(--gx)] overflow-y-auto px-[var(--gx)]">
      <div className="relative mx-auto w-full max-w-4xl">
        {!isTv && <RoundButton label={t("common.back")} onClick={back}><ArrowLeft className="rtl-flip" /></RoundButton>}
        <div className="m-rise mt-6 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-accent-blue-container md:size-24"><Trophy className="size-8 md:size-12" /></span>
            <div className="min-w-0">
              <h1 dir="auto" className="line-clamp-2 text-2xl font-medium tracking-tight md:text-4xl">{title}</h1>
              {sport && <p className="mt-1 text-sm text-muted-foreground md:text-base">{t(`pages.sports.sport.${sport}`)}</p>}
            </div>
          </div>
          <Pill data-autofocus className="self-start md:ms-auto md:self-auto" variant={follow ? "tonal" : "primary"} onClick={() => toggleFollow({ provider, teamId: leagueId, name: title, league: title, kind: "league" })}>
            {follow ? <Check /> : <Plus />}{follow ? t("pages.team.unfollow") : t("pages.team.follow")}
          </Pill>
        </div>

        <div role="tablist" data-nav-group className="mt-6 flex gap-2">
          {(["matches", "table"] as const).map((k) => (
            <button key={k} role="tab" data-nav data-pill aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn("min-h-11 rounded-full px-5 text-base font-medium", tab === k ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground")}>
              {t(k === "matches" ? "pages.league.matches" : "pages.league.table")}
            </button>
          ))}
        </div>

        {tab === "matches" && (
          <>
            {games === null && <div role="status" aria-label={t("pages.team.loading")} className="mt-6 flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skel h-16 rounded-2xl" />)}</div>}
            {err && <p role="alert" className="mt-6 text-destructive">{t("pages.team.error")}</p>}
            {games && !games.length && !err && <p className="mt-6 text-muted-foreground">{t("pages.league.noGames")}</p>}
            {list(t("pages.sports.live"), live)}
            {list(t("pages.sports.upcoming"), upcoming)}
            {list(t("pages.sports.results"), results)}
          </>
        )}
        {tab === "table" && (
          <div className="mt-6 flex flex-col gap-4">
            {table === null && <div role="status" aria-label={t("pages.team.loading")} className="skel h-96 rounded-2xl" />}
            {table && !table.length && <p className="text-muted-foreground">{t("pages.league.noTable")}</p>}
            {table?.map((g, i) => <StandingsTable key={i} group={g} mark={mine} onTeam={(tm) => go("team", { id: `${provider}~${tm.id}`, name: tm.name, badge: tm.badge, league: title })} />)}
          </div>
        )}
      </div>
    </div>
    </Shell>
  )
}
