// Sports port types. Type-only (no runtime imports) so the pure mappers stay runnable under `node scripts/sports.check.ts`.

export type SportsConfig = { id: string; enabled: boolean; key?: string; proxy?: string }
export interface SportsTeam { id: string; name: string; badge?: string; league?: string; women?: boolean; short?: string }
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
  tv?: string[] // broadcasters (only when the provider lists any)
  note?: string // round / leg / aggregate ("Round of 16", "1st Leg")
  homeRed?: number // red cards so far (only when a provider lists them)
  awayRed?: number
}
/** A league a provider covers (its own ids: sport + league codes). `top` = part of the default "All games" day view. */
export type LeagueRef = { sport: string; league: string; name: string; top?: boolean }
/** A team or a whole tournament a profile follows. `kind` = "league" means `teamId` holds a competition id. */
export interface Follow { provider: string; teamId: string; name: string; badge?: string; league?: string; kind?: "team" | "league" }
/** A single match, addressed by its sport/league/id (the ESPN summary endpoint needs all three). */
export type MatchRef = { sport: string; league: string; id: string }
export interface MatchSide { team: SportsTeam; score?: number; winner?: boolean }
export interface MatchStatRow { label: string; home: string; away: string; key?: string } // key = the provider's own stat name (merge-pure maps it to a shared one)
/** A key moment: goal (own goal / penalty), card or substitution. `players`: scorer then assist; for a substitution, on then off. */
export interface MatchEvent { kind: "goal" | "og" | "pen" | "yellow" | "red" | "sub"; side: "home" | "away"; minute: string; players: string[]; text?: string }
export interface LineupPlayer { name: string; number?: string; pos?: string; subIn?: boolean; subOut?: boolean }
export interface Lineup { formation?: string; starters: LineupPlayer[]; bench: LineupPlayer[] }
/** One of a team's last games: W / D / L, the score and the opponent. */
export interface FormGame { result: "W" | "D" | "L"; score: string; opp: string; oppBadge?: string; at: number; home: boolean; competition?: string }
export interface H2HGame { at: number; home: string; away: string; homeScore?: number; awayScore?: number }
/** A league table: one group per conference / group; `cols` are the column headings, each row's `values` follow them. */
export interface StandingRow { rank: number; team: SportsTeam; values: string[]; note?: string; color?: string }
export interface StandingGroup { name: string; cols: string[]; rows: StandingRow[] }
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
  events: MatchEvent[]
  lineups?: { home: Lineup; away: Lineup }
  form: { home: FormGame[]; away: FormGame[] }
  h2h?: { summary?: string; games: H2HGame[] }
  tv: string[]
  table: StandingGroup[] // the competition's table as the summary carries it (soccer leagues)
  note?: string
  sources?: string[] // names of the providers this view was built from (set by matchSummary)
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
  schedule?(teamIds: string[], from: number, to: number, cfg: SportsConfig): Promise<SportsGame[]>
  /** Live games for the given followed ids (team ids and/or competition ids). */
  live?(ids: string[], cfg: SportsConfig): Promise<SportsGame[]>
  /** One match with its team-stat comparison, venue and officials. */
  summary?(ref: MatchRef, cfg: SportsConfig): Promise<SportsMatch | null>
  /** Another provider's match as this one knows it (found by teams + kick-off), merged into that summary to fill its gaps. */
  lookup?(m: SportsMatch, ref: MatchRef, cfg: SportsConfig): Promise<SportsMatch | null>
  /** Its own games on the days of another provider's games, merged into those to fill their gaps (withAlts / mergeGames). */
  around?(games: SportsGame[], cfg: SportsConfig): Promise<SportsGame[]>
  /** Every game of these competitions on one local day (the Sports tab's "All games"). */
  day?(ids: string[], dayMs: number, cfg: SportsConfig): Promise<SportsGame[]>
  /** A competition's table(s). */
  standings?(id: string, cfg: SportsConfig): Promise<StandingGroup[]>
}
