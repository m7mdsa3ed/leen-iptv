// Pure ESPN mappers (no alias imports, no fetch) so `node scripts/sports.check.ts` can run them.
import type { FormGame, GameStatus, H2HGame, LeagueRef, Lineup, LineupPlayer, MatchEvent, MatchStatRow, SportsGame, SportsMatch, SportsTeam, StandingGroup, StandingRow } from "./types"

/** Sports the app shows (ESPN slugs), in chip order. Only these sports' scoreboards share the format the parsers read (search drops the rest, e.g. cricket). */
export const SPORTS = ["soccer", "basketball", "football", "baseball", "hockey"] as const
export const supportedSport = (sport: string) => (SPORTS as readonly string[]).includes(sport)

/** Leagues the ESPN adapter covers out of the box (the quick list in Settings and the "All games" day view); search finds any other one.
    `top` = in the default "All games" view (all sports): one fetch per league per day, so this stays short. Egypt / UAE / Qatar leagues: ESPN has none. */
export const LEAGUES: LeagueRef[] = [
  { sport: "soccer", league: "eng.1", name: "Premier League", top: true },
  { sport: "soccer", league: "esp.1", name: "LaLiga", top: true },
  { sport: "soccer", league: "ita.1", name: "Serie A", top: true },
  { sport: "soccer", league: "ger.1", name: "Bundesliga", top: true },
  { sport: "soccer", league: "fra.1", name: "Ligue 1", top: true },
  { sport: "soccer", league: "uefa.champions", name: "UEFA Champions League", top: true },
  { sport: "soccer", league: "uefa.europa", name: "UEFA Europa League", top: true },
  { sport: "soccer", league: "uefa.europa.conf", name: "UEFA Conference League" },
  { sport: "soccer", league: "ksa.1", name: "Saudi Pro League", top: true },
  { sport: "soccer", league: "ksa.kings.cup", name: "Saudi King's Cup" },
  { sport: "soccer", league: "caf.champions", name: "CAF Champions League", top: true },
  { sport: "soccer", league: "caf.confed", name: "CAF Confederation Cup" },
  { sport: "soccer", league: "afc.champions", name: "AFC Champions League Elite" },
  { sport: "soccer", league: "eng.2", name: "EFL Championship" },
  { sport: "soccer", league: "eng.fa", name: "FA Cup" },
  { sport: "soccer", league: "eng.league_cup", name: "Carabao Cup" },
  { sport: "soccer", league: "esp.copa_del_rey", name: "Copa del Rey" },
  { sport: "soccer", league: "ita.coppa_italia", name: "Coppa Italia" },
  { sport: "soccer", league: "ger.dfb_pokal", name: "DFB-Pokal" },
  { sport: "soccer", league: "ned.1", name: "Eredivisie" },
  { sport: "soccer", league: "por.1", name: "Primeira Liga" },
  { sport: "soccer", league: "tur.1", name: "Süper Lig" },
  { sport: "soccer", league: "sco.1", name: "Scottish Premiership" },
  { sport: "soccer", league: "bel.1", name: "Belgian Pro League" },
  { sport: "soccer", league: "usa.1", name: "MLS" },
  { sport: "soccer", league: "mex.1", name: "Liga MX" },
  { sport: "soccer", league: "bra.1", name: "Brasileirão" },
  { sport: "soccer", league: "arg.1", name: "Liga Profesional Argentina" },
  { sport: "soccer", league: "conmebol.libertadores", name: "Copa Libertadores" },
  { sport: "soccer", league: "eng.w.1", name: "Women's Super League" },
  { sport: "soccer", league: "fifa.world", name: "World Cup" },
  { sport: "soccer", league: "fifa.cwc", name: "FIFA Club World Cup" },
  { sport: "soccer", league: "fifa.worldq.caf", name: "World Cup Qualifying (CAF)" },
  { sport: "soccer", league: "uefa.euro", name: "UEFA Euro" },
  { sport: "soccer", league: "uefa.nations", name: "UEFA Nations League" },
  { sport: "soccer", league: "caf.nations", name: "Africa Cup of Nations" },
  { sport: "soccer", league: "conmebol.america", name: "Copa América" },
  { sport: "soccer", league: "afc.asian.cup", name: "AFC Asian Cup" },
  { sport: "basketball", league: "nba", name: "NBA", top: true },
  { sport: "basketball", league: "wnba", name: "WNBA" },
  { sport: "basketball", league: "mens-college-basketball", name: "NCAA Men's Basketball" },
  { sport: "basketball", league: "fiba", name: "FIBA World Cup" },
  { sport: "football", league: "nfl", name: "NFL", top: true },
  { sport: "football", league: "college-football", name: "College Football" },
  { sport: "baseball", league: "mlb", name: "MLB", top: true },
  { sport: "hockey", league: "nhl", name: "NHL", top: true },
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
    ...(str(t.shortDisplayName) && t.shortDisplayName !== t.displayName ? { short: String(t.shortDisplayName) } : {}),
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
/** scoreboard `broadcasts: [{names: [...]}]` or summary `broadcasts: [{media: {shortName}}]` -> { tv } when there is any */
const tvOf = (b: unknown): { tv?: string[] } => {
  const names = [...new Set((Array.isArray(b) ? b as J[] : []).flatMap((x) => (Array.isArray(x?.names) ? x.names : [x?.media?.shortName ?? x?.media?.name])).filter((n): n is string => typeof n === "string" && !!n))]
  return names.length ? { tv: names } : {}
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
      ...tvOf(c?.broadcasts),
      ...(str(c?.notes?.[0]?.headline) ? { note: String(c!.notes[0].headline) } : {}),
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
    return [{ label: String(h?.label ?? a?.label ?? name), home: val(h), away: val(a), key: name }]
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
    events: parseKeyEvents(json?.keyEvents, String(homeC.team?.id ?? "")),
    ...(lineupsOf(json?.rosters) ?? {}),
    form: { home: formOf(json?.lastFiveGames, String(homeC.team?.id ?? "")), away: formOf(json?.lastFiveGames, String(awayC.team?.id ?? "")) },
    ...h2hOf(json?.seasonseries),
    tv: tvOf(json?.broadcasts).tv ?? [],
    table: ((json?.standings?.groups ?? []) as J[]).map((g) => standingGroup(g, ref, String(g.header ?? ""))).filter((g) => g.rows.length),
    ...(str(comp.notes?.[0]?.headline) ? { note: String(comp.notes[0].headline) } : {}),
  }
}

/** keyEvents -> goals (own goal / penalty), cards and substitutions; kick-off / half-time markers are left out. */
export function parseKeyEvents(raw: unknown, homeId: string): MatchEvent[] {
  const out: MatchEvent[] = []
  for (const e of (Array.isArray(raw) ? raw as J[] : [])) {
    const ty = String(e?.type?.type ?? "").toLowerCase()
    const kind: MatchEvent["kind"] | undefined = /own/.test(ty) ? "og" : /penalty/.test(ty) && e?.scoringPlay ? "pen" : /goal/.test(ty) || e?.scoringPlay ? "goal"
      : /yellow/.test(ty) ? "yellow" : /red/.test(ty) ? "red" : /substitution/.test(ty) ? "sub" : undefined
    if (!kind) continue
    out.push({ kind, side: String(e?.team?.id ?? "") === homeId ? "home" : "away", minute: String(e?.clock?.displayValue ?? ""), players: ((e?.participants ?? []) as J[]).map((p) => str(p?.athlete?.displayName)).filter(Boolean) as string[], ...(str(e?.text) ? { text: String(e.text) } : {}) })
  }
  return out
}

/** rosters (soccer) -> starters (by formation place) and bench per side; undefined when the provider sends no line-ups yet. */
export function lineupsOf(raw: unknown): { lineups: { home: Lineup; away: Lineup } } | undefined {
  const list = Array.isArray(raw) ? raw as J[] : []
  const one = (r: J | undefined): Lineup | undefined => {
    const ps = Array.isArray(r?.roster) ? r!.roster as J[] : []
    if (!ps.length) return undefined
    const p = (x: J): LineupPlayer => ({ name: String(x.athlete?.displayName ?? "?"), ...(str(x.jersey) ? { number: String(x.jersey) } : {}), ...(str(x.position?.abbreviation) ? { pos: String(x.position.abbreviation) } : {}), ...(x.subbedIn ? { subIn: true } : {}), ...(x.subbedOut ? { subOut: true } : {}) })
    const place = (x: J) => Number(x.formationPlace) || 99
    return { ...(str(r?.formation) ? { formation: String(r!.formation) } : {}), starters: ps.filter((x) => x.starter).sort((a, b) => place(a) - place(b)).map(p), bench: ps.filter((x) => !x.starter).map(p) }
  }
  const home = one(list.find((r) => r.homeAway === "home")), away = one(list.find((r) => r.homeAway === "away"))
  return home && away ? { lineups: { home, away } } : undefined
}

/** lastFiveGames -> one team's form, newest first. */
export function formOf(raw: unknown, teamId: string): FormGame[] {
  const t = (Array.isArray(raw) ? raw as J[] : []).find((x) => String(x?.team?.id) === teamId)
  return ((t?.events ?? []) as J[]).flatMap((e): FormGame[] => {
    const r = String(e.gameResult ?? "").toUpperCase()
    const at = Date.parse(String(e.gameDate ?? ""))
    if ((r !== "W" && r !== "D" && r !== "L") || isNaN(at)) return []
    return [{ result: r, score: String(e.score ?? ""), opp: String(e.opponent?.displayName ?? "?"), ...(str(e.opponentLogo) ? { oppBadge: String(e.opponentLogo) } : {}), at, home: String(e.homeTeamId) === teamId, ...(str(e.competitionName) ? { competition: String(e.competitionName) } : {}) }]
  }).sort((a, b) => b.at - a.at)
}

/** seasonseries head-to-head -> its summary line and the past meetings, newest first. */
export function h2hOf(raw: unknown): { h2h?: { summary?: string; games: H2HGame[] } } {
  const s = (Array.isArray(raw) ? raw as J[] : []).find((x) => x?.type === "head-to-head") ?? (Array.isArray(raw) ? (raw as J[])[0] : undefined)
  if (!s) return {}
  const games = ((s.events ?? []) as J[]).flatMap((e): H2HGame[] => {
    const at = Date.parse(String(e.date ?? ""))
    const cs: J[] = e.competitors ?? []
    const h = cs.find((c) => c.homeAway === "home"), a = cs.find((c) => c.homeAway === "away")
    if (isNaN(at) || !h || !a) return []
    return [{ at, home: String(h.team?.displayName ?? "?"), away: String(a.team?.displayName ?? "?"), ...(num(h.score) != null ? { homeScore: num(h.score) } : {}), ...(num(a.score) != null ? { awayScore: num(a.score) } : {}) }]
  }).sort((a, b) => b.at - a.at)
  return games.length || s.summary ? { h2h: { ...(str(s.summary) ? { summary: String(s.summary) } : {}), games } } : {}
}

/** Table columns per sport (ESPN stat names, first match wins); the heading is ESPN's abbreviation. */
const COLS: Record<string, string[]> = {
  soccer: ["gamesPlayed", "wins", "ties", "losses", "pointDifferential", "points"],
  hockey: ["gamesPlayed", "wins", "losses", "otLosses", "points"],
  default: ["wins", "losses", "winPercent", "gamesBehind", "streak"],
}
/** One standings group (`{ standings: { entries } }`, entries' `team` an object or just a name) -> rows sorted by rank / seed. */
export function standingGroup(g: J, ref: LeagueRef, name = ""): StandingGroup {
  const entries: J[] = g?.standings?.entries ?? []
  const want = COLS[ref.sport] ?? COLS.default
  const statOf = (e: J, n: string) => ((e.stats ?? []) as J[]).find((x) => x.name === n)
  const cols = want.filter((n) => entries.some((e) => statOf(e, n)))
  const rows = entries.map((e, i): StandingRow => {
    const t = typeof e.team === "string" ? { id: e.id, displayName: e.team, logos: e.logo } : e.team ?? {}
    const rank = Number(statOf(e, "rank")?.value ?? statOf(e, "playoffSeed")?.value) || i + 1
    return { rank, team: mapTeam(t, ref), values: cols.map((n) => String(statOf(e, n)?.displayValue ?? "")), ...(str(e.note?.description) ? { note: String(e.note.description) } : {}), ...(str(e.note?.color) ? { color: String(e.note.color) } : {}) }
  }).sort((a, b) => a.rank - b.rank)
  const heads = cols.map((n) => String(entries.map((e) => statOf(e, n)).find(Boolean)?.abbreviation ?? n))
  return { name: String(g?.name ?? name), cols: heads, rows }
}
/** /apis/v2/.../standings -> one group per conference / group (or the single table). */
export function parseStandings(json: J, ref: LeagueRef): StandingGroup[] {
  const groups: J[] = Array.isArray(json?.children) && json.children.length ? json.children : json?.standings ? [json] : []
  return groups.map((g) => standingGroup(g, ref, String(json?.name ?? ref.name))).filter((g) => g.rows.length)
}

/** YYYYMMDD of a local day. */
export const dayCode = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}` }
const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
/** The ESPN scoreboard days (`dates=YYYYMMDD`, US Eastern; a date range returns nothing for soccer) that cover the local day of `ms`: one or two. */
export function espnDays(ms: number): string[] {
  const d = new Date(ms); d.setHours(0, 0, 0, 0)
  const start = d.getTime(); d.setDate(d.getDate() + 1)
  return [...new Set([start, d.getTime() - 1].map((t) => ET.format(t).replace(/-/g, "")))]
}
/** Same local calendar day. */
export const sameDay = (a: number, b: number) => dayCode(a) === dayCode(b)

/** A team's stable key across competitions (the league part of a team id is not): `sport:teamId`. */
export const teamKey = (id: string): string => { const p = String(id).split("/"); return `${p[0] ?? ""}:${p[p.length - 1] ?? ""}` }
/** Only the games one of `teamIds` plays in, matched by team so its cup/friendly games count too. */
export const involving = (games: SportsGame[], teamIds: string[]): SportsGame[] => {
  const s = new Set(teamIds.map(teamKey))
  return games.filter((g) => s.has(teamKey(g.home.id)) || s.has(teamKey(g.away.id)))
}
