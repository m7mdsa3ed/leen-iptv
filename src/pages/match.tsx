import { Shell } from "@/components/tv/ui"
import { useEffect, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowLeftRight, CalendarClock, ChevronRight, Database, Flag, Goal, MapPin, Star, Tv, Users, type LucideIcon } from "lucide-react"
import { RoundButton, SkelBar } from "@/components/gtv"
import { Countdown, StandingsTable, TeamBadge } from "@/components/tv/sports"
import { SPORTS_PROVIDERS, type FormGame, type Lineup, type MatchEvent, type SportsMatch } from "@/lib/api"
import { useApp, useFollows } from "@/lib/store"
import { teamKey } from "@/lib/sports/pure"
import { matchSummary } from "@/lib/sports/games"
import { useRoute } from "@/lib/nav"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const LIVE_MS = 30000 // refresh the score / stats this often while the match is in play
const sk = "skel !bg-surface-3"

function Tile({ icon: I, label, value, wide }: { icon: LucideIcon; label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div data-nav tabIndex={0} className={cn("flex items-center gap-3 rounded-2xl bg-surface-2 p-4 outline-none", wide && "sm:col-span-2")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-3 text-muted-foreground"><I className="size-5" /></span>
      <span className="min-w-0">
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span dir="auto" className="block">{value}</span>
      </span>
    </div>
  )
}

/** Placeholder with the same footprint as the loaded page (scoreboard, stats card, info tiles). */
function Skel({ label }: { label: string }) {
  const team = <div className="flex flex-1 flex-col items-center gap-3"><div className={cn(sk, "size-16 rounded-full md:size-24")} /><SkelBar className="w-24 !bg-surface-3" /></div>
  return (
    <div role="status" aria-label={label} className="mt-6">
      <div aria-hidden className="rounded-3xl bg-surface-2 p-4 md:p-8">
        <SkelBar className="mx-auto w-32 !bg-surface-3" />
        <div className="mt-6 flex items-center gap-4">{team}<div className={cn(sk, "h-12 w-28 rounded-2xl md:h-16 md:w-40")} />{team}</div>
      </div>
      <div aria-hidden className="mt-6 flex flex-col gap-5 rounded-3xl bg-surface-2 p-4 md:p-6">
        <SkelBar className="w-36 !bg-surface-3" />
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex flex-col gap-2"><SkelBar className="mx-auto w-1/3 !bg-surface-3" /><div className={cn(sk, "h-1.5 rounded-full")} /></div>)}
      </div>
      <div aria-hidden className="mt-6 grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skel h-[4.5rem] rounded-2xl" />)}</div>
    </div>
  )
}

/** One match: scoreboard (teams, score/status), the team-stat comparison, and venue/officials. Refreshes while live.
 *  Route id = `${provider}~${sport}/${league}/${eventId}`. */
export default function MatchPage({ id }: { id?: string }) {
  const t = useT()
  const back = useRoute((s) => s.back)
  const go = useRoute((s) => s.go)
  const onTop = useRoute((s) => s.stack[s.stack.length - 1]?.name === "match") // a stacked (hidden) match page stops polling
  const proxy = useApp((s) => s.settings.proxy)
  const [provider, rest] = String(id ?? "").split("~")
  const [sport, league, ...tail] = (rest ?? "").split("/")
  const eventId = tail.join("/")
  const prov = SPORTS_PROVIDERS.find((p) => p.id === provider && p.summary)
  const [m, setM] = useState<SportsMatch | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  // the match's own provider, then every other one that finds it (FotMob) merged in; `first` paints the primary without waiting
  const load = (first?: (r: SportsMatch) => void) => matchSummary(provider, { sport, league, id: eventId }, proxy, first)

  useEffect(() => {
    if (!prov || !sport || !league || !eventId) return
    let live = true
    setM(null); setErr(""); setBusy(true)
    load((r) => { if (live) { setM(r); setBusy(false) } })
      .then((r) => { if (live) { setM(r); setBusy(false) } })
      .catch((e) => { if (live) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false) } })
    return () => { live = false }
  }, [provider, sport, league, eventId, proxy]) // eslint-disable-line react-hooks/exhaustive-deps

  // in play: quiet refresh (a failed poll keeps the last good data)
  const inPlay = m?.status === "live"
  useEffect(() => {
    if (!inPlay || !onTop) return
    let live = true
    const id = window.setInterval(() => void load().then((r) => { if (live && r) setM(r) }, () => {}), LIVE_MS)
    return () => { live = false; window.clearInterval(id) }
  }, [inPlay, eventId, onTop]) // eslint-disable-line react-hooks/exhaustive-deps

  const follows = useFollows()
  const toggleFollow = useApp((s) => s.toggleFollow)
  const [tab, setTab] = useState("summary")
  const isFollowed = (id: string) => follows.some((f) => f.kind !== "league" && teamKey(f.teamId) === teamKey(id))
  const side = (s: SportsMatch["home"], other: SportsMatch["home"]) => {
    const on = isFollowed(s.team.id)
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
        <button data-nav data-pill onClick={() => go("team", { id: `${provider}~${s.team.id}`, name: s.team.name, badge: s.team.badge })} className="flex w-full flex-col items-center gap-3 rounded-2xl p-2">
          <TeamBadge team={s.team} className="size-16 drop-shadow md:size-24" />
          <span dir="auto" className={cn("line-clamp-2 w-full text-center text-base md:text-xl", s.winner && "font-semibold", other.winner && "text-muted-foreground")}>{s.team.name}</span>
        </button>
        <button data-nav data-pill aria-pressed={on} onClick={() => toggleFollow({ provider, teamId: s.team.id, name: s.team.name, badge: s.team.badge, league: s.team.league })}
          className={cn("flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium", on ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-surface-3 text-muted-foreground")}>
          <Star className={cn("size-3.5", on && "fill-current")} />{t(on ? "pages.match.following" : "pages.team.follow")}
        </button>
      </div>
    )
  }

  // key events: the home side's on the start, the away side's on the end, the minute between
  const icon = (e: MatchEvent) => e.kind === "yellow" || e.kind === "red"
    ? <span aria-hidden className={cn("inline-block h-4 w-3 rounded-[2px]", e.kind === "yellow" ? "bg-yellow-400" : "bg-red-600")} />
    : e.kind === "sub" ? <ArrowLeftRight aria-hidden className="size-4 text-muted-foreground" /> : <Goal aria-hidden className={cn("size-4", e.kind === "og" ? "text-destructive" : "text-emerald-500")} />
  const eventText = (e: MatchEvent) => {
    const [a, b] = e.players
    const tag = e.kind === "og" ? ` (${t("pages.match.og")})` : e.kind === "pen" ? ` (${t("pages.match.pen")})` : ""
    return (
      <span className="min-w-0">
        <span dir="auto" className="block truncate font-medium">{(a ?? t(`pages.match.ev.${e.kind}`)) + tag}</span>
        {b && <span dir="auto" className="block truncate text-xs text-muted-foreground">{e.kind === "sub" ? `${t("pages.match.off")}: ${b}` : `${t("pages.match.assist")}: ${b}`}</span>}
      </span>
    )
  }
  const timeline = (evs: MatchEvent[]) => (
    <div className="flex flex-col gap-1">
      {evs.map((e, i) => (
        <div key={i} data-nav tabIndex={0} aria-label={`${e.minute} ${t(`pages.match.ev.${e.kind}`)} ${e.players.join(", ")}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl px-2 py-1.5 text-sm outline-none">
          <span className="flex min-w-0 items-center justify-end gap-2 text-end">{e.side === "home" && <>{eventText(e)}{icon(e)}</>}</span>
          <span dir="ltr" className="min-w-12 rounded-full bg-surface-3 px-2 py-0.5 text-center text-xs font-semibold tabular-nums">{e.minute}</span>
          <span className="flex min-w-0 items-center gap-2">{e.side === "away" && <>{icon(e)}{eventText(e)}</>}</span>
        </div>
      ))}
    </div>
  )
  const lineup = (l: Lineup, team: SportsMatch["home"]["team"]) => (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl bg-surface-2 p-3 md:p-4">
      <div className="flex items-center gap-2"><TeamBadge team={team} className="size-6" /><span dir="auto" className="min-w-0 flex-1 truncate font-medium">{team.name}</span>{l.formation && <span dir="ltr" className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold">{l.formation}</span>}</div>
      {[["", l.starters], [t("pages.match.bench"), l.bench]].map(([head, ps]) => (ps as Lineup["starters"]).length > 0 && (
        <div key={head as string} className="flex flex-col">
          {head && <div className="mt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{head as string}</div>}
          {(ps as Lineup["starters"]).map((p, i) => (
            <div key={i} data-nav tabIndex={0} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm outline-none">
              <span className="w-6 shrink-0 text-end text-xs tabular-nums text-muted-foreground">{p.number}</span>
              <span dir="auto" className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.subIn && <ArrowLeftRight aria-label={t("pages.match.subIn")} className="size-3.5 shrink-0 text-emerald-500" />}
              {p.subOut && <ArrowLeftRight aria-label={t("pages.match.subOut")} className="size-3.5 shrink-0 text-destructive" />}
              {p.pos && <span className="w-8 shrink-0 text-end text-xs text-muted-foreground">{p.pos}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
  const form = (fs: FormGame[], team: SportsMatch["home"]["team"]) => fs.length > 0 && (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3 md:p-4">
      <div className="flex items-center gap-2"><TeamBadge team={team} className="size-6" /><span dir="auto" className="min-w-0 flex-1 truncate font-medium">{team.name}</span>
        <span className="flex gap-1">{fs.map((f, i) => <span key={i} title={`${f.opp} ${f.score}`} className={cn("grid size-6 place-items-center rounded-md text-xs font-bold text-white", f.result === "W" ? "bg-emerald-600" : f.result === "D" ? "bg-zinc-500" : "bg-red-600")}>{t(`pages.match.res.${f.result}`)}</span>)}</span>
      </div>
      {fs.map((f, i) => (
        <div key={i} data-nav tabIndex={0} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm outline-none">
          <span className="w-16 shrink-0 text-xs text-muted-foreground">{fmt.date(f.at, { day: "numeric", month: "short" })}</span>
          <span className="w-5 shrink-0 text-xs text-muted-foreground">{f.home ? t("pages.match.homeShort") : t("pages.match.awayShort")}</span>
          <TeamBadge team={{ name: f.opp, badge: f.oppBadge }} className="size-5" />
          <span dir="auto" className="min-w-0 flex-1 truncate">{f.opp}</span>
          <span dir="ltr" className="shrink-0 tabular-nums">{f.score}</span>
        </div>
      ))}
    </div>
  )

  const scored = m && m.status !== "scheduled" && m.home.score != null && m.away.score != null
  const status = m && (m.status === "live"
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1 text-sm font-medium text-white"><span aria-hidden className="size-2 animate-pulse rounded-full bg-white" />{[t("pages.team.live"), m.detail].filter(Boolean).join("  ·  ")}</span>
    : m.status === "final"
      ? <span className="rounded-full bg-surface-3 px-3 py-1 text-sm font-medium">{m.detail ?? t("pages.team.final")}</span>
      : <span className="rounded-full bg-accent-blue-container px-3 py-1 text-sm font-medium text-accent-blue"><Countdown at={m.startMs} /></span>)

  // stat rows: values at both ends, the label between, and two bars that meet in the middle (the bigger side highlighted)
  const stat = (s: SportsMatch["stats"][number]) => {
    const hn = parseFloat(s.home), an = parseFloat(s.away)
    const bar = Number.isFinite(hn) && Number.isFinite(an) && hn + an > 0
    const hp = bar ? (hn / (hn + an)) * 100 : 0, ap = bar ? 100 - hp : 0
    const lead = !bar || hn === an ? "" : hn > an ? "h" : "a"
    // data-nav on the rows: TV scrolls a page only by moving focus down it
    return (
      <div key={s.key ?? s.label} data-nav tabIndex={0} className="rounded-2xl p-2 outline-none">
        <div dir="ltr" data-ltr className="grid grid-cols-[4rem_1fr_4rem] items-center gap-2 text-sm md:text-base">
          <span className={lead === "h" ? "font-semibold" : "text-muted-foreground"}>{s.home || "-"}</span>
          <span className="text-center text-muted-foreground">{s.label}</span>
          <span className={cn("text-end", lead === "a" ? "font-semibold" : "text-muted-foreground")}>{s.away || "-"}</span>
        </div>
        {bar && (
          <div dir="ltr" data-ltr className="mt-1.5 flex gap-1.5">
            <div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-surface-3"><span className={cn("h-full rounded-full", lead === "h" ? "bg-accent-blue" : "bg-foreground/40")} style={{ width: `${hp}%` }} /></div>
            <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><span className={cn("h-full rounded-full", lead === "a" ? "bg-accent-blue" : "bg-foreground/40")} style={{ width: `${ap}%` }} /></div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Shell page="sports" title={m ? `${m.home.team.name} - ${m.away.team.name}` : t("pages.match.title")} sub>
    <div className="under-top under-bottom relative -mx-[var(--gx)] overflow-y-auto px-[var(--gx)]">
      <div className="relative mx-auto w-full max-w-4xl">
        {!isTv && <RoundButton label={t("common.back")} onClick={back}><ArrowLeft className="rtl-flip" /></RoundButton>}
        {busy && <Skel label={t("pages.match.loading")} />}
        {err && <p role="alert" className="mt-6 text-destructive">{t("pages.match.error")}</p>}
        {m && !busy && (
          <>
            <header className="m-rise mt-6 overflow-hidden rounded-3xl bg-gradient-to-b from-accent-blue-container to-surface-2 p-4 md:p-8">
              {m.league && <p className="text-center"><button data-nav data-pill onClick={() => go("league", { id: `${provider}~${sport}/${league}`, name: m.league })} dir="auto" className="rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground md:text-sm">{m.league}</button></p>}
              {m.note && <p dir="auto" className="mt-1 text-center text-xs text-muted-foreground md:text-sm">{m.note}</p>}
              <div className="mt-4 flex items-start gap-2" data-nav-group>
                {side(m.home, m.away)}
                <div className="flex shrink-0 flex-col items-center gap-3 pt-3 md:pt-6">
                  {scored ? (
                    <div dir="ltr" data-ltr className="flex items-center gap-3 text-5xl font-semibold tabular-nums md:text-7xl">
                      <span className={cn(m.away.winner && "text-muted-foreground")}>{fmt.digits(m.home.score!)}</span>
                      <span className="text-3xl text-muted-foreground md:text-5xl">-</span>
                      <span className={cn(m.home.winner && "text-muted-foreground")}>{fmt.digits(m.away.score!)}</span>
                    </div>
                  ) : (
                    <div dir="ltr" data-ltr className="text-4xl font-semibold tabular-nums md:text-6xl">{fmt.time(m.startMs)}</div>
                  )}
                  {status}
                  <div className="text-xs text-muted-foreground md:text-sm">{fmt.date(m.startMs, { weekday: "short", day: "numeric", month: "short" })}</div>
                </div>
                {side(m.away, m.home)}
              </div>
            </header>

            {(() => {
              const table = m.table.find((g) => g.rows.some((r) => teamKey(r.team.id) === teamKey(m.home.team.id) || teamKey(r.team.id) === teamKey(m.away.team.id))) ?? m.table[0]
              const tabs = [
                { k: "summary", label: t("pages.match.tab.summary") },
                ...(m.lineups ? [{ k: "lineups", label: t("pages.match.tab.lineups") }] : []),
                ...(m.stats.length ? [{ k: "stats", label: t("pages.match.stats") }] : []),
                ...(m.form.home.length || m.form.away.length || m.h2h?.games.length ? [{ k: "h2h", label: t("pages.match.tab.h2h") }] : []),
                ...(table ? [{ k: "table", label: t("pages.league.table") }] : []),
              ]
              const cur = tabs.some((x) => x.k === tab) ? tab : "summary"
              const inMatch = (id: string) => teamKey(id) === teamKey(m.home.team.id) || teamKey(id) === teamKey(m.away.team.id)
              return (
                <>
                  <div role="tablist" data-nav-group className="no-scrollbar m-rise -mx-1 mt-5 flex gap-2 overflow-x-auto p-1">
                    {tabs.map((x) => <button key={x.k} role="tab" data-nav data-pill aria-selected={cur === x.k} onClick={() => setTab(x.k)} className={cn("min-h-11 shrink-0 rounded-full px-5 text-sm font-medium md:text-base", cur === x.k ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground")}>{x.label}</button>)}
                  </div>
                  {cur === "summary" && (
                    <>
                      {m.events.length > 0
                        ? <section className="mt-4 rounded-3xl bg-surface-2 p-3 md:p-5">{timeline(m.events)}</section>
                        : <p className="mt-4 text-muted-foreground">{t(m.status === "scheduled" ? "pages.match.notStarted" : "pages.match.noEvents")}</p>}
                      <h2 className="mt-8 text-xl font-medium">{t("pages.match.info")}</h2>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Tile icon={CalendarClock} label={t("pages.match.kickoff")} value={`${fmt.date(m.startMs, { weekday: "short", day: "numeric", month: "short" })} · ${fmt.time(m.startMs)}`} />
                        {m.venue && <Tile icon={MapPin} label={t("pages.match.venue")} value={m.venue} />}
                        {m.attendance && <Tile icon={Users} label={t("pages.match.attendance")} value={Number.isFinite(Number(m.attendance)) ? fmt.number(Number(m.attendance)) : m.attendance} />}
                        {m.tv.length > 0 && <Tile icon={Tv} label={t("pages.match.tv")} value={m.tv.join(", ")} />}
                        {m.officials.length > 0 && <Tile icon={Flag} label={t("pages.match.officials")} value={m.officials.join(", ")} wide />}
                        {m.sources && m.sources.length > 1 && <Tile icon={Database} label={t("pages.match.sources")} value={m.sources.join(", ")} wide />}
                      </div>
                    </>
                  )}
                  {cur === "lineups" && m.lineups && <div className="mt-4 flex flex-col gap-3 md:flex-row" data-nav-group>{lineup(m.lineups.home, m.home.team)}{lineup(m.lineups.away, m.away.team)}</div>}
                  {cur === "stats" && (
                    <section className="mt-4 rounded-3xl bg-surface-2 p-4 md:p-6">
                      <div dir="ltr" data-ltr className="flex items-center gap-3">
                        <TeamBadge team={m.home.team} className="size-7" />
                        <h2 dir="auto" className="flex-1 text-center text-lg font-medium md:text-xl">{t("pages.match.stats")}</h2>
                        <TeamBadge team={m.away.team} className="size-7" />
                      </div>
                      <div className="mt-5 flex flex-col gap-4">{m.stats.map(stat)}</div>
                    </section>
                  )}
                  {cur === "h2h" && (
                    <div className="mt-4 flex flex-col gap-3">
                      {(m.form.home.length > 0 || m.form.away.length > 0) && <h2 className="text-lg font-medium">{t("pages.match.form")}</h2>}
                      {form(m.form.home, m.home.team)}
                      {form(m.form.away, m.away.team)}
                      {m.h2h && m.h2h.games.length > 0 && (
                        <>
                          <h2 className="mt-4 text-lg font-medium">{t("pages.match.tab.h2h")}</h2>
                          {m.h2h.summary && <p dir="auto" className="text-sm text-muted-foreground">{m.h2h.summary}</p>}
                          <div className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-2">
                            {m.h2h.games.map((g, i) => (
                              <div key={i} data-nav tabIndex={0} className="grid grid-cols-[5rem_1fr_auto_1fr] items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none">
                                <span className="text-xs text-muted-foreground">{fmt.date(g.at, { day: "numeric", month: "short", year: "numeric" })}</span>
                                <span dir="auto" className="truncate text-end">{g.home}</span>
                                <span dir="ltr" className="rounded-md bg-surface-3 px-2 py-0.5 font-semibold tabular-nums">{g.homeScore ?? "-"} - {g.awayScore ?? "-"}</span>
                                <span dir="auto" className="truncate">{g.away}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {cur === "table" && table && (
                    <div className="mt-4 flex flex-col gap-3">
                      <StandingsTable group={table} mark={inMatch} onTeam={(tm) => go("team", { id: `${provider}~${tm.id}`, name: tm.name, badge: tm.badge })} />
                      <button data-nav data-pill onClick={() => go("league", { id: `${provider}~${sport}/${league}`, name: m.league })} className="flex items-center gap-1 self-start rounded-full px-3 py-1.5 text-sm text-muted-foreground">{t("pages.match.fullLeague")}<ChevronRight className="rtl-flip size-4" /></button>
                    </div>
                  )}
                </>
              )
            })()}
          </>
        )}
      </div>
    </div>
    </Shell>
  )
}
