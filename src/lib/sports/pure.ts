// Pure ESPN mappers (no alias imports, no fetch) so `node scripts/sports.check.ts` can run them.
import type { GameStatus, LeagueRef, SportsGame, SportsTeam } from "./types"

/** Leagues the ESPN adapter covers out of the box (add more here). */
export const LEAGUES: LeagueRef[] = [
  { sport: "soccer", league: "eng.1", name: "Premier League" },
  { sport: "soccer", league: "esp.1", name: "LaLiga" },
  { sport: "soccer", league: "ita.1", name: "Serie A" },
  { sport: "soccer", league: "ger.1", name: "Bundesliga" },
  { sport: "soccer", league: "fra.1", name: "Ligue 1" },
  { sport: "soccer", league: "uefa.champions", name: "UEFA Champions League" },
  { sport: "soccer", league: "usa.1", name: "MLS" },
  { sport: "soccer", league: "ksa.1", name: "Saudi Pro League" },
  { sport: "basketball", league: "nba", name: "NBA" },
  { sport: "football", league: "nfl", name: "NFL" },
  { sport: "baseball", league: "mlb", name: "MLB" },
  { sport: "hockey", league: "nhl", name: "NHL" },
]

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const str = (v: unknown) => (v == null || v === "" ? undefined : String(v))

/** A followed team's id carries its league: "soccer/eng.1/364". */
export const espnTeamId = (sport: string, league: string, id: string) => `${sport}/${league}/${id}`
export function splitTeamId(id: string): { sport: string; league: string; id: string } {
  const [sport = "", league = "", ...rest] = String(id).split("/")
  return { sport, league, id: rest.join("/") }
}

/** Loose name comparison: lowercase, accents stripped. */
export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim()

const logo = (t: J): string | undefined => str(t.logo) ?? str(t.logos?.[0]?.href)

export function mapTeam(t: J, ref: LeagueRef): SportsTeam {
  return {
    id: espnTeamId(ref.sport, ref.league, String(t.id)),
    name: String(t.displayName ?? t.name ?? t.shortDisplayName ?? "?"),
    badge: logo(t),
    league: ref.name,
  }
}

/** /sports/{sport}/{league}/teams -> the league's teams. */
export function parseTeams(json: J, ref: LeagueRef): SportsTeam[] {
  const raw = json?.sports?.[0]?.leagues?.[0]?.teams ?? json?.sports?.[0]?.teams ?? json?.teams ?? []
  return (Array.isArray(raw) ? raw : []).map((x: J) => mapTeam(x?.team ?? x, ref))
}

const status = (t: J | undefined): GameStatus => {
  const s = t?.state ?? t?.type?.state
  if (s === "in") return "live"
  if (s === "post" || t?.completed || t?.type?.completed) return "final"
  return "scheduled"
}
const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v))

/** scoreboard / team-schedule `events` -> games (home/away, status, score, venue), sorted by start. */
export function parseEvents(json: J, ref: LeagueRef): SportsGame[] {
  const events = Array.isArray(json?.events) ? (json.events as J[]) : []
  const out: SportsGame[] = []
  for (const e of events) {
    const c: J | undefined = e?.competitions?.[0]
    const comps: J[] = Array.isArray(c?.competitors) ? (c!.competitors as J[]) : []
    const home = comps.find((x) => x.homeAway === "home") ?? comps[0]
    const away = comps.find((x) => x.homeAway === "away") ?? comps[1]
    if (!home || !away) continue
    const startMs = Date.parse(String(e.date))
    if (isNaN(startMs)) continue
    out.push({
      id: String(e.id ?? `${home.team?.id}-${away.team?.id}-${e.date}`),
      league: ref.name,
      home: mapTeam(home.team ?? {}, ref),
      away: mapTeam(away.team ?? {}, ref),
      startMs,
      status: status(c?.status?.type ?? c?.status),
      homeScore: num(home.score),
      awayScore: num(away.score),
      venue: str(c?.venue?.fullName),
    })
  }
  return out.sort((a, b) => a.startMs - b.startMs)
}

/** A competition id is `${sport}/${league}` (no team id). */
export const competitionId = (ref: LeagueRef) => `${ref.sport}/${ref.league}`
export function leagueOfId(id: string): LeagueRef | undefined {
  const parts = String(id).split("/")
  if (parts.length !== 2) return undefined // a team id has three parts
  return LEAGUES.find((l) => l.sport === parts[0] && l.league === parts[1])
}

/** The YYYYMM codes (max 24) covering [from, to] — ESPN's scoreboard takes a month at a time. */
export function monthsBetween(from: number, to: number): string[] {
  const out: string[] = []
  const d = new Date(from); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0)
  while (d.getTime() <= to && out.length < 24) { out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`); d.setUTCMonth(d.getUTCMonth() + 1) }
  return out
}

/** Only the games one of `teamIds` plays in. */
export const involving = (games: SportsGame[], teamIds: string[]): SportsGame[] => {
  const s = new Set(teamIds)
  return games.filter((g) => s.has(g.home.id) || s.has(g.away.id))
}
