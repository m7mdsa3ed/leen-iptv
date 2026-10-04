// ESPN adapter for the SportsProvider port. Keyless; team ids are league-qualified ("soccer/eng.1/364") and
// competition ids are "sport/league" ("soccer/eng.1").
// Requests go through the app's CORS proxy (px) when the backend config carries one, since site.api sends no CORS headers.
import { fetchT, px } from "@/lib/net"
import { cached } from "@/lib/meta/cache"
import type { LeagueRef, SportsConfig, SportsGame, SportsProvider, SportsTeam } from "./types"
import { LEAGUES, competitionId, involving, leagueOfId, monthsBetween, norm, parseEvents, parseTeams, splitTeamId } from "./pure"

const BASE = "https://site.api.espn.com/apis/site/v2/sports"
const SB_TTL = 2 * 3600_000 // a month's scoreboard is reused across every team/page for 2h; the Refresh button force-clears it
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const url = (r: LeagueRef, path: string) => `${BASE}/${r.sport}/${r.league}/${path}`
const get = async (u: string, cfg?: SportsConfig): Promise<J> => (await fetchT(px(u, cfg?.proxy ?? ""), 15000)).json()
const refOf = (id: string): LeagueRef | undefined => {
  const { sport, league } = splitTeamId(id)
  return LEAGUES.find((l) => l.sport === sport && l.league === league)
}
const refsOf = (ids: string[]): LeagueRef[] => {
  const seen = new Set<string>(), out: LeagueRef[] = []
  for (const id of ids) {
    const r = id.split("/").length >= 3 ? refOf(id) : leagueOfId(id)
    const k = r && `${r.sport}/${r.league}`
    if (r && k && !seen.has(k)) { seen.add(k); out.push(r) }
  }
  return out
}
/** One league-month of games, cached so teams/pages in the same league share a single fetch. */
const scoreboard = (r: LeagueRef, month: string, cfg?: SportsConfig): Promise<SportsGame[]> =>
  cached(`sb:${r.sport}:${r.league}:${month}`, SB_TTL, () => get(url(r, `scoreboard?dates=${month}`), cfg).then((j) => parseEvents(j, r)).catch(() => [] as SportsGame[]))

/** Games across the given leagues' months, de-duplicated and windowed. */
async function months_(refs: LeagueRef[], from: number, to: number, cfg?: SportsConfig): Promise<SportsGame[]> {
  const months = monthsBetween(from, to).slice(0, 8)
  if (!months.length || !refs.length) return []
  const lists = await Promise.all(refs.flatMap((r) => months.map((m) => scoreboard(r, m, cfg))))
  const out = new Map<string, SportsGame>()
  for (const g of lists.flat()) if (!out.has(g.id)) out.set(g.id, g)
  return [...out.values()].filter((g) => g.startMs >= from && g.startMs <= to).sort((a, b) => a.startMs - b.startMs)
}

export const espn: SportsProvider = {
  id: "espn",
  name: "ESPN",
  needsKey: false,

  async searchTeams(q, cfg) {
    const needle = norm(q)
    if (!needle) return []
    const lists = await Promise.all(LEAGUES.map((r) => get(url(r, "teams"), cfg).then((j) => parseTeams(j, r)).catch(() => [] as SportsTeam[])))
    return lists.flat().filter((t) => norm(t.name).includes(needle)).slice(0, 50)
  },

  competitions() {
    return LEAGUES.map((r) => ({ id: competitionId(r), name: r.name, league: r.name }))
  },

  // Every game of the followed leagues in the window (the league scoreboard, not filtered to a team).
  competitionGames(ids, from, to, cfg) {
    return months_(refsOf(ids), from, to, cfg)
  },

  // Upcoming games come from the league scoreboard by month: the team-schedule endpoint only returns games already played.
  async schedule(teamIds, from, to, cfg) {
    const refs = refsOf(teamIds)
    const games = await months_(refs, from, to, cfg)
    return involving(games, teamIds)
  },

  // Live scores are never cached: poll the current scoreboard while a game is in play. `ids` may be team and/or competition ids.
  async live(ids, cfg) {
    const lists = await Promise.all(refsOf(ids).map(async (r) => parseEvents(await get(url(r, "scoreboard"), cfg).catch(() => ({})), r)))
    const teams = new Set(ids.filter((id) => id.split("/").length >= 3))
    const leagues = ids.filter((id) => id.split("/").length === 2)
    return lists.flat().filter((g) => g.status === "live" && (
      teams.has(g.home.id) || teams.has(g.away.id) || leagues.some((l) => g.home.id.startsWith(l + "/") || g.away.id.startsWith(l + "/"))
    ))
  },
}
