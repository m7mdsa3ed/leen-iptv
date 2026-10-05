// Sports port types. Type-only (no runtime imports) so the pure mappers stay runnable under `node scripts/sports.check.ts`.

export type SportsConfig = { id: string; enabled: boolean; key?: string; proxy?: string }
export interface SportsTeam { id: string; name: string; badge?: string; league?: string; women?: boolean }
/** A league / cup the provider covers (its `id` is `${sport}/${league}`, e.g. "soccer/eng.1"). */
export interface SportsCompetition { id: string; name: string; league?: string; badge?: string }
export type GameStatus = "scheduled" | "live" | "final"
export interface SportsGame {
  id: string
  league?: string
  home: SportsTeam
  away: SportsTeam
  startMs: number
  status: GameStatus
  detail?: string // e.g. "63'" while live, "FT" when finished
  homeScore?: number
  awayScore?: number
  venue?: string
}
/** A league a provider covers (its own ids: sport + league codes). */
export type LeagueRef = { sport: string; league: string; name: string }
/** A team or a whole tournament a profile follows. `kind` = "league" means `teamId` holds a competition id. */
export interface Follow { provider: string; teamId: string; name: string; badge?: string; league?: string; kind?: "team" | "league" }
/** A single match, addressed by its sport/league/id (the ESPN summary endpoint needs all three). */
export type MatchRef = { sport: string; league: string; id: string }
export interface MatchSide { team: SportsTeam; score?: number; winner?: boolean }
export interface MatchStatRow { label: string; home: string; away: string }
export interface SportsMatch {
  id: string
  league?: string
  startMs: number
  status: GameStatus
  detail?: string
  venue?: string
  attendance?: string
  officials: string[]
  home: MatchSide
  away: MatchSide
  stats: MatchStatRow[]
}

/** A sports data source: schedules/live scores for the teams and competitions a user follows. */
export interface SportsProvider {
  id: string
  name: string
  needsKey: boolean
  searchTeams?(q: string, cfg: SportsConfig): Promise<SportsTeam[]>
  /** Global search: any team (club or national) the provider covers. */
  searchTeams?(q: string, cfg: SportsConfig): Promise<SportsTeam[]>
  /** The curated starter competitions (the picker's quick list). */
  competitions?(): SportsCompetition[]
  /** Global search: any league or cup (the picker's search box). */
  searchCompetitions?(q: string, cfg: SportsConfig): Promise<SportsCompetition[]>
  /** All games of the given competitions (league ids) in [from, to]. */
  competitionGames?(ids: string[], from: number, to: number, cfg: SportsConfig): Promise<SportsGame[]>
  schedule(teamIds: string[], from: number, to: number, cfg: SportsConfig): Promise<SportsGame[]>
  /** Live games for the given followed ids (team ids and/or competition ids). */
  live?(ids: string[], cfg: SportsConfig): Promise<SportsGame[]>
  /** One match with its team-stat comparison, venue and officials. */
  summary?(ref: MatchRef, cfg: SportsConfig): Promise<SportsMatch | null>
}
