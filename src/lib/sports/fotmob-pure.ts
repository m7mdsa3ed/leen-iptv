// FotMob (www.fotmob.com/api/data, unofficial, keyless) -> the sports port types. Pure: `node scripts/sports.check.ts`.
import type { FormGame, GameStatus, H2HGame, Lineup, LineupPlayer, MatchEvent, MatchStatRow, SportsGame, SportsMatch, SportsTeam } from "./types.ts"

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const str = (v: unknown) => (v == null || v === "" ? undefined : String(v))
const num = (v: unknown) => { const n = Number(v); return v == null || v === "" || !Number.isFinite(n) ? undefined : n }
const team = (t: J | undefined): SportsTeam => ({ id: `fotmob/${t?.id ?? ""}`, name: String(t?.name ?? "?"), ...(str(t?.imageUrl) ? { badge: String(t!.imageUrl) } : {}) })
const statusOf = (s: J | undefined): GameStatus => (s?.finished ? "final" : s?.started && !s?.cancelled ? "live" : "scheduled")

/** /matches?date=YYYYMMDD&timezone=UTC -> every game listed that UTC day (ids are FotMob match ids). */
export function parseFotmobDay(json: J): SportsGame[] {
  return ((json?.leagues ?? []) as J[]).flatMap((l) => ((l.matches ?? []) as J[]).flatMap((m): SportsGame[] => {
    const startMs = Date.parse(String(m.status?.utcTime ?? ""))
    if (isNaN(startMs) || m.id == null) return []
    const status = statusOf(m.status), hr = num(m.status?.numberOfHomeRedCards), ar = num(m.status?.numberOfAwayRedCards)
    const detail = str(status === "live" ? m.status?.liveTime?.short : status === "final" ? m.status?.reason?.short : undefined)
    return [{ id: String(m.id), league: str(l.name), home: team(m.home), away: team(m.away), startMs, status, homeScore: num(m.home?.score), awayScore: num(m.away?.score), ...(detail ? { detail } : {}), ...(hr ? { homeRed: hr } : {}), ...(ar ? { awayRed: ar } : {}) }]
  }))
}

/** All periods' team stats, every group flattened (top stats, shots, xG, passes, defence, duels, discipline), first of each key. */
function stats(raw: J | undefined): MatchStatRow[] {
  const out: MatchStatRow[] = [], seen = new Set<string>()
  for (const g of (raw?.Periods?.All?.stats ?? []) as J[]) for (const s of (g.stats ?? []) as J[]) {
    const [h, a] = Array.isArray(s.stats) ? s.stats : []
    const key = String(s.key ?? s.title)
    if (s.type === "title" || h == null || a == null || seen.has(key)) continue
    seen.add(key)
    out.push({ label: String(s.title ?? key), home: String(h), away: String(a), key })
  }
  return out
}

/** Goals (own goal / penalty, scorer then assist), cards (second yellow = red) and substitutions (on then off); shoot-out kicks are left out. */
function events(raw: unknown): MatchEvent[] {
  return (Array.isArray(raw) ? raw as J[] : []).flatMap((e): MatchEvent[] => {
    if (e.isPenaltyShootoutEvent) return []
    const side = e.isHome ? "home" : "away"
    const minute = `${e.time ?? ""}'${e.overloadTime ? `+${e.overloadTime}'` : ""}`
    const names = (...xs: unknown[]) => xs.map(str).filter(Boolean) as string[]
    if (e.type === "Goal") return [{ kind: e.ownGoal ? "og" : /pen/i.test(String(e.goalDescriptionKey ?? e.suffixKey ?? "")) ? "pen" : "goal", side, minute, players: names(e.nameStr, e.assistInput) }]
    if (e.type === "Card") return [{ kind: /red/i.test(String(e.card)) ? "red" : "yellow", side, minute, players: names(e.nameStr) }]
    if (e.type === "Substitution") return [{ kind: "sub", side, minute, players: names(...((e.swap ?? []) as J[]).map((p) => p?.name)) }]
    return []
  })
}

function lineups(raw: J | undefined): { lineups: { home: Lineup; away: Lineup } } | undefined {
  const one = (t: J | undefined): Lineup | undefined => {
    const starters = (t?.starters ?? []) as J[]
    if (!starters.length) return undefined
    const subbed = (x: J, ty: string) => ((x.performance?.substitutionEvents ?? []) as J[]).some((s) => s?.type === ty)
    const p = (x: J): LineupPlayer => ({ name: String(x.name ?? "?"), ...(str(x.shirtNumber) ? { number: String(x.shirtNumber) } : {}), ...(subbed(x, "subIn") ? { subIn: true } : {}), ...(subbed(x, "subOut") ? { subOut: true } : {}) })
    return { ...(str(t?.formation) ? { formation: String(t!.formation) } : {}), starters: starters.map(p), bench: ((t?.subs ?? []) as J[]).map(p) }
  }
  const home = one(raw?.homeTeam), away = one(raw?.awayTeam)
  return home && away ? { lineups: { home, away } } : undefined
}

/** teamForm[i] -> that team's last games, newest first (the opponent is the side that is not `isOurTeam`). */
function form(raw: unknown): FormGame[] {
  return (Array.isArray(raw) ? raw as J[] : []).flatMap((f): FormGame[] => {
    const r = String(f.resultString ?? "").toUpperCase(), at = Date.parse(String(f.date?.utcTime ?? ""))
    if ((r !== "W" && r !== "D" && r !== "L") || isNaN(at)) return []
    const home = !!f.home?.isOurTeam, opp: J | undefined = home ? f.away : f.home
    return [{ result: r, score: String(f.score ?? ""), opp: String(opp?.name ?? "?"), ...(str(f.imageUrl) ? { oppBadge: String(f.imageUrl) } : {}), at, home }]
  }).sort((a, b) => b.at - a.at)
}

function h2h(raw: J | undefined): { h2h?: { games: H2HGame[] } } {
  const games = ((raw?.matches ?? []) as J[]).flatMap((m): H2HGame[] => {
    const at = Date.parse(String(m.status?.utcTime ?? m.time?.utcTime ?? ""))
    if (isNaN(at) || !m.status?.finished) return []
    const [hs, as] = String(m.status?.scoreStr ?? "").split("-").map((x) => num(x.trim()))
    return [{ at, home: String(m.home?.name ?? "?"), away: String(m.away?.name ?? "?"), ...(hs != null ? { homeScore: hs } : {}), ...(as != null ? { awayScore: as } : {}) }]
  }).sort((a, b) => b.at - a.at)
  return games.length ? { h2h: { games } } : {}
}

/** /matchDetails?matchId= -> one match; null when the answer is not a match (blocked, changed shape). No table/TV: FotMob only links them. */
export function parseFotmobMatch(json: J): SportsMatch | null {
  const g: J | undefined = json?.general, c: J = json?.content ?? {}
  if (!g?.matchId) return null
  const [ht, at] = (json?.header?.teams ?? []) as J[]
  const st: J = json?.header?.status ?? {}
  const startMs = Date.parse(String(g.matchTimeUTCDate ?? st.utcTime ?? ""))
  const status = statusOf(st)
  const hs = num(ht?.score), as = num(at?.score)
  const done = status === "final" && hs != null && as != null
  const info: J = c.matchFacts?.infoBox ?? {}
  return {
    id: String(g.matchId),
    league: str(g.leagueName),
    startMs: isNaN(startMs) ? 0 : startMs,
    status,
    detail: str(status === "live" ? st.liveTime?.short : st.reason?.short),
    venue: str(info.Stadium?.name),
    attendance: str(info.Attendance),
    officials: str(info.Referee?.text) ? [String(info.Referee.text)] : [],
    home: { team: team(ht ?? g.homeTeam), score: hs, winner: done && hs! > as! },
    away: { team: team(at ?? g.awayTeam), score: as, winner: done && as! > hs! },
    stats: stats(c.stats),
    events: events(c.matchFacts?.events?.events),
    ...lineups(c.lineup),
    form: { home: form(c.matchFacts?.teamForm?.[0]), away: form(c.matchFacts?.teamForm?.[1]) },
    ...h2h(c.h2h),
    tv: [],
    table: [],
  }
}
