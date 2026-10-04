// Sports port types. Type-only (no runtime imports) so the pure mappers stay runnable under `node scripts/sports.check.ts`.

export type SportsConfig = { id: string; enabled: boolean; key?: string; proxy?: string }
export interface SportsTeam { id: string; name: string; badge?: string; league?: string }
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
  homeScore?: number
  awayScore?: number
  venue?: string
}
/** A league a provider covers (its own ids: sport + league codes). */
export type LeagueRef = { sport: string; league: string; name: string }
/** A team or a whole tournament a profile follows. `kind` = "league" means `teamId` holds a competition id. */
export interface Follow { provider: string; teamId: string; name: string; badge?: string; league?: string; kind?: "team" | "league" }
/** A sports data source: schedules/live scores for the teams and competitions a user follows. */
export interface SportsProvider {
  id: string
  name: string
  needsKey: boolean
  searchTeams?(q: string, cfg: SportsConfig): Promise<SportsTeam[]>
  /** The leagues/cups this provider covers (for the follow picker). */
  competitions?(): SportsCompetition[]
  /** All games of the given competitions (league ids) in [from, to]. */
  competitionGames?(ids: string[], from: number, to: number, cfg: SportsConfig): Promise<SportsGame[]>
  schedule(teamIds: string[], from: number, to: number, cfg: SportsConfig): Promise<SportsGame[]>
  /** Live games for the given followed ids (team ids and/or competition ids). */
  live?(ids: string[], cfg: SportsConfig): Promise<SportsGame[]>
}
