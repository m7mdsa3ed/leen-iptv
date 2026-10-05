import { SPORTS_PROVIDERS, type Follow, type SportsGame, type SportsProvider } from "@/lib/api"
import { teamKey } from "./pure"

/** Games of one follow (a team or a competition) in [from, to]. The provider caches the month scoreboard (see espn.ts). */
export function scheduleFor(follow: Follow, proxy: string, from: number, to: number): Promise<SportsGame[]> {
  const prov = SPORTS_PROVIDERS.find((p) => p.id === follow.provider)
  if (!prov) return Promise.resolve([])
  const cfg = { id: prov.id, enabled: true, proxy }
  if (follow.kind === "league") return prov.competitionGames ? prov.competitionGames([follow.teamId], from, to, cfg).catch(() => []) : Promise.resolve([])
  return prov.schedule ? prov.schedule([follow.teamId], from, to, cfg).catch(() => []) : Promise.resolve([])
}

/** Games of the followed teams/competitions in `[now - back days, now + days]`, merged and de-duplicated (a match between
 *  two follows shows once). `back = 0` is upcoming-only. */
export async function upcomingGames(follows: Follow[], proxy: string, days = 30, back = 0): Promise<SportsGame[]> {
  if (!follows.length) return []
  const from = Date.now() - Math.max(3 * 3600_000, back * 864e5)
  const to = Date.now() + days * 864e5
  const lists = await Promise.all(follows.map((f) => scheduleFor(f, proxy, from, to)))
  const out = new Map<string, SportsGame>()
  for (const g of lists.flat()) if (!out.has(g.id)) out.set(g.id, g)
  return [...out.values()].sort((a, b) => a.startMs - b.startMs)
}

/** Current live scores for the followed teams/competitions (not cached; poll it while a game is in play). */
export async function liveScores(follows: Follow[], proxy: string): Promise<SportsGame[]> {
  const byProv = new Map<string, { prov: SportsProvider; ids: string[] }>()
  for (const f of follows) {
    const prov = SPORTS_PROVIDERS.find((p) => p.id === f.provider && p.live)
    if (!prov) continue
    const e = byProv.get(prov.id) ?? { prov, ids: [] }
    if (!e.ids.includes(f.teamId)) e.ids.push(f.teamId)
    byProv.set(prov.id, e)
  }
  const lists = await Promise.all([...byProv.values()].map(({ prov, ids }) => prov.live!(ids, { id: prov.id, enabled: true, proxy }).catch(() => [] as SportsGame[])))
  return lists.flat()
}

/** The followed team playing in this game (for bolding), or undefined for a competition game. */
export const teamInGame = (follows: Follow[], g: SportsGame): string | undefined =>
  follows.find((f) => f.kind !== "league" && (teamKey(f.teamId) === teamKey(g.home.id) || teamKey(f.teamId) === teamKey(g.away.id)))?.teamId

/** Route params to open a game's match page (needs provider + sport/league/event). */
export function matchRoute(follows: Follow[], g: SportsGame): { id: string } | undefined {
  const follow = follows.find((f) => f.kind !== "league" && (teamKey(f.teamId) === teamKey(g.home.id) || teamKey(f.teamId) === teamKey(g.away.id)))
    ?? follows.find((f) => f.kind === "league" && (g.home.id.startsWith(f.teamId + "/") || g.away.id.startsWith(f.teamId + "/")))
  const [sport, league] = g.home.id.split("/")
  if (!follow || !sport || !league || !g.id) return undefined
  return { id: `${follow.provider}~${sport}/${league}/${g.id}` }
}

/** Route params to open from a game: the followed team's page, else the home team's page for a followed competition. */
export function gameRoute(follows: Follow[], g: SportsGame): { id: string; name: string; badge?: string; league?: string } | undefined {
  const team = follows.find((f) => f.kind !== "league" && (teamKey(f.teamId) === teamKey(g.home.id) || teamKey(f.teamId) === teamKey(g.away.id)))
  if (team) return { id: `${team.provider}~${team.teamId}`, name: team.name, badge: team.badge, league: team.league }
  const lg = follows.find((f) => f.kind === "league" && (g.home.id.startsWith(f.teamId + "/") || g.away.id.startsWith(f.teamId + "/")))
  if (lg) return { id: `${lg.provider}~${g.home.id}`, name: g.home.name }
  return undefined
}
