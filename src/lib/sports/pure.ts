// Pure ESPN mappers (no alias imports, no fetch) so `node scripts/sports.check.ts` can run them.
import type { GameStatus, LeagueRef, MatchStatRow, SportsGame, SportsMatch, SportsTeam } from "./types"

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
  { sport: "soccer", league: "fifa.world", name: "World Cup" },
  { sport: "soccer", league: "uefa.euro", name: "UEFA Euro" },
  { sport: "soccer", league: "uefa.nations", name: "UEFA Nations League" },
  { sport: "soccer", league: "caf.nations", name: "Africa Cup of Nations" },
]

/** Competitions a team may also play in, queried alongside its own league (friendlies are separate competitions). */
export const EXTRA_LEAGUES: LeagueRef[] = [
  { sport: "soccer", league: "fifa.friendly", name: "International Friendly" },
  { sport: "soccer", league: "club.friendly", name: "Club Friendly" },
]

/** Leagues discovered at runtime (e.g. from search), keyed by `${sport}/${league}`. */
const known = new Map<string, LeagueRef>([...LEAGUES, ...EXTRA_LEAGUES].map((l) => [`${l.sport}/${l.league}`, l]))
/** Remember a league's display name so its games can show it (first name wins). */
export function registerLeague(ref: LeagueRef): LeagueRef {
  const k = `${ref.sport}/${ref.league}`
  const hit = known.get(k)
  if (hit) return hit
  known.set(k, ref)
  return ref
}
/** Resolve a sport/league pair; falls back to the slug for the display name. */
export const refFor = (sport: string, league: string): LeagueRef => known.get(`${sport}/${league}`) ?? { sport, league, name: league }

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
      detail: str(c?.status?.type?.detail),
      homeScore: num(home.score),
      awayScore: num(away.score),
      venue: str(c?.venue?.fullName),
    })
  }
  return out.sort((a, b) => a.startMs - b.startMs)
}

/** True when a league slug names a women's competition ("eng.w.1", "esp.w.1", "caf.w.nations"). */
export const isWomenLeague = (league: string): boolean => /(?:^|[.\-_])w(?:[.\-_]|$)/i.test(league) || /women/i.test(league)

/** A competition id is `${sport}/${league}` (no team id). */
export const competitionId = (ref: LeagueRef) => `${ref.sport}/${ref.league}`
export function leagueOfId(id: string): LeagueRef | undefined {
  const parts = String(id).split("/")
  if (parts.length !== 2) return undefined // a team id has three parts
  return refFor(parts[0], parts[1])
}

/** The YYYYMM codes (max 24) covering [from, to] — ESPN's scoreboard takes a month at a time. */
export function monthsBetween(from: number, to: number): string[] {
  const out: string[] = []
  const d = new Date(from); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0)
  while (d.getTime() <= to && out.length < 24) { out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`); d.setUTCMonth(d.getUTCMonth() + 1) }
  return out
}

/** The stat rows shown on a match page, in this order (ESPN names; anything missing is skipped). */
const STAT_ORDER = ["possessionPct", "totalShots", "shotsOnTarget", "wonCorners", "foulsCommitted", "yellowCards", "redCards", "offsides", "saves", "totalPasses", "passPct", "accurateCrosses"]

/** One match summary (ESPN `/summary?event=`): header teams + scores, the boxscore team-stat comparison, venue and officials. */
export function parseMatch(json: J, ref: LeagueRef, id: string): SportsMatch {
  const comp: J = json?.header?.competitions?.[0] ?? {}
  const comps: J[] = Array.isArray(comp.competitors) ? comp.competitors : []
  const homeC: J = comps.find((c) => c.homeAway === "home") ?? comps[0] ?? {}
  const awayC: J = comps.find((c) => c.homeAway === "away") ?? comps[1] ?? {}
  const bySide = new Map<string, Map<string, J>>()
  for (const t of ((json?.boxscore?.teams ?? []) as J[])) {
    const m = new Map<string, J>()
    for (const s of ((t.statistics ?? []) as J[])) m.set(String(s.name), s)
    bySide.set(String(t.homeAway), m)
  }
  const hs = bySide.get("home") ?? new Map(), as = bySide.get("away") ?? new Map()
  const val = (s: J | undefined) => (s ? str(s.displayValue) ?? str(s.value) ?? "" : "")
  const stats: MatchStatRow[] = STAT_ORDER.flatMap((name) => {
    const h = hs.get(name), a = as.get(name)
    if (!h && !a) return []
    return [{ label: String(h?.label ?? a?.label ?? name), home: val(h), away: val(a) }]
  })
  const gi: J = json?.gameInfo ?? {}
  const startMs = Date.parse(String(comp.date ?? json?.header?.date ?? ""))
  return {
    id,
    league: ref.name,
    startMs: isNaN(startMs) ? 0 : startMs,
    status: status(comp.status?.type ?? comp.status),
    detail: str(comp.status?.type?.detail),
    venue: str(gi.venue?.fullName),
    attendance: str(gi.attendance),
    officials: ((gi.officials ?? []) as J[]).map((o) => str(o.displayName)).filter(Boolean) as string[],
    home: { team: mapTeam(homeC.team ?? {}, ref), score: num(homeC.score), winner: !!homeC.winner },
    away: { team: mapTeam(awayC.team ?? {}, ref), score: num(awayC.score), winner: !!awayC.winner },
    stats,
  }
}

/** A team's stable key across competitions (the league part of a team id is not): `sport:teamId`. */
export const teamKey = (id: string): string => { const p = String(id).split("/"); return `${p[0] ?? ""}:${p[p.length - 1] ?? ""}` }
/** Only the games one of `teamIds` plays in, matched by team so its cup/friendly games count too. */
export const involving = (games: SportsGame[], teamIds: string[]): SportsGame[] => {
  const s = new Set(teamIds.map(teamKey))
  return games.filter((g) => s.has(teamKey(g.home.id)) || s.has(teamKey(g.away.id)))
}
