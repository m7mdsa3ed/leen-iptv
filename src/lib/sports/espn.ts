// ESPN adapter for the SportsProvider port. Keyless. Team ids are league-qualified ("soccer/eng.1/364"),
// competition ids are "sport/league" ("soccer/eng.1"); any league ESPN knows can be used, not just LEAGUES.
// Requests go through the app's CORS proxy (px) when the backend config carries one, since site.api sends no CORS headers.
import { fetchT, px } from "@/lib/net"
import { cached } from "@/lib/meta/cache"
import type { LeagueRef, SportsCompetition, SportsConfig, SportsGame, SportsProvider, SportsTeam } from "./types"
import { EXTRA_LEAGUES, LEAGUES, competitionId, involving, isWomenLeague, leagueOfId, monthsBetween, norm, parseEvents, parseMatch, refFor, registerLeague, splitTeamId, teamKey } from "./pure"

const BASE = "https://site.api.espn.com/apis/site/v2/sports"
const SEARCH = "https://site.api.espn.com/apis/common/v3/search"
const SB_TTL = 2 * 3600_000 // a month's scoreboard is reused across every team/page for 2h; the Refresh button force-clears it
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
/** One item of the global search: a team or a league anywhere on ESPN. */
type Hit = { id?: string; displayName?: string; type?: string; sport?: string; league?: string }
const url = (r: LeagueRef, path: string) => `${BASE}/${r.sport}/${r.league}/${path}`
const get = async (u: string, cfg?: SportsConfig): Promise<J> => (await fetchT(px(u, cfg?.proxy ?? ""), 15000)).json()
/** Any team, national team or league, anywhere (answers carry `sport` + `league`, so the id is unambiguous). */
const search = async (q: string, proxy: string, limit = 30): Promise<Hit[]> => ((await get(`${SEARCH}?query=${encodeURIComponent(q.trim())}&limit=${limit}`, { id: "espn", enabled: true, proxy })) as { items?: Hit[] }).items ?? []
const refOf = (id: string): LeagueRef => { const { sport, league } = splitTeamId(id); return refFor(sport, league) }
const refsOf = (ids: string[]): LeagueRef[] => {
  const seen = new Set<string>(), out: LeagueRef[] = []
  for (const id of ids) {
    const r = id.split("/").length >= 3 ? refOf(id) : leagueOfId(id)
    const k = r && competitionId(r)
    if (r && k && !seen.has(k)) { seen.add(k); out.push(r) }
  }
  return out
}
/** A team's own league(s) plus the cross-competition leagues it may also play in (friendlies). */
const withExtras = (refs: LeagueRef[]): LeagueRef[] => {
  const sports = new Set(refs.map((r) => r.sport))
  const extra = EXTRA_LEAGUES.filter((l) => sports.has(l.sport) && !refs.some((r) => r.sport === l.sport && r.league === l.league))
  return [...refs, ...extra]
}
/** One league-month of games, cached so teams/pages in the same league share a single fetch. */
const scoreboard = (r: LeagueRef, month: string, cfg?: SportsConfig): Promise<SportsGame[]> =>
  cached(`sb:${r.sport}:${r.league}:${month}`, SB_TTL, () => get(url(r, `scoreboard?dates=${month}`), cfg).then((j) => {
    const nm = j.leagues?.[0]?.name // the response carries the league's display name: remember it so games stop showing the slug
    return parseEvents(j, nm ? registerLeague({ sport: r.sport, league: r.league, name: String(nm) }) : r)
  }).catch(() => [] as SportsGame[]))

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

  // Global search: any team (club or national) across every league ESPN covers.
  async searchTeams(q, cfg) {
    if (!norm(q)) return []
    const out = new Map<string, SportsTeam>()
    for (const it of await search(q, cfg?.proxy ?? "").catch(() => [])) {
      if (it.type === "league" && it.sport && it.league) registerLeague({ sport: it.sport, league: it.league, name: it.displayName ?? it.league })
      if (it.type !== "team" || !it.id || !it.sport || !it.league) continue
      const ref = registerLeague({ sport: it.sport, league: it.league, name: refFor(it.sport, it.league).name })
      const key = `${ref.sport}:${it.id}` // one row per ESPN team (men/women/youth/reserves are different ids, same displayName)
      if (out.has(key)) continue
      out.set(key, { id: `${ref.sport}/${ref.league}/${it.id}`, name: it.displayName ?? String(it.id), league: ref.name, women: isWomenLeague(it.league) })
    }
    return [...out.values()].slice(0, 40)
  },

  // Global search: any league or cup (competitive or friendly).
  async searchCompetitions(q, cfg) {
    if (!norm(q)) return []
    const out = new Map<string, SportsCompetition>()
    for (const it of await search(q, cfg?.proxy ?? "").catch(() => [])) {
      if (it.type !== "league" || !it.sport || !it.league) continue
      const ref = registerLeague({ sport: it.sport, league: it.league, name: it.displayName ?? it.league })
      const id = competitionId(ref)
      if (!out.has(id)) out.set(id, { id, name: ref.name, league: ref.name })
    }
    return [...out.values()].slice(0, 40)
  },

  // The curated starter list (one-tap follows); search covers everything else.
  competitions() {
    return LEAGUES.map((r) => ({ id: competitionId(r), name: r.name, league: r.name }))
  },

  competitionGames(ids, from, to, cfg) {
    return months_(refsOf(ids), from, to, cfg)
  },

  // Upcoming games come from the league scoreboard by month: the team-schedule endpoint only returns games already played.
  async schedule(teamIds, from, to, cfg) {
    const games = await months_(withExtras(refsOf(teamIds)), from, to, cfg)
    return involving(games, teamIds)
  },

  // One match with its stats (2-min cache so stadium stats stay fresh while a match is in play).
  summary(ref, cfg) {
    const r = refFor(ref.sport, ref.league)
    return cached(`sm:${r.sport}:${r.league}:${ref.id}`, 120000, async () => {
      const j = await get(`${url(r, "summary")}?event=${encodeURIComponent(ref.id)}`, cfg).catch(() => null)
      return j ? parseMatch(j, r, ref.id) : null
    }, (m) => !m)
  },

  // Live scores are never cached: poll the current scoreboard while a game is in play. `ids` may be team and/or competition ids.
  async live(ids, cfg) {
    const lists = await Promise.all(withExtras(refsOf(ids)).map(async (r) => parseEvents(await get(url(r, "scoreboard"), cfg).catch(() => ({})), r)))
    const teams = new Set(ids.filter((id) => id.split("/").length >= 3).map(teamKey))
    const leagues = ids.filter((id) => id.split("/").length === 2)
    return lists.flat().filter((g) => g.status === "live" && (
      teams.has(teamKey(g.home.id)) || teams.has(teamKey(g.away.id)) || leagues.some((l) => g.home.id.startsWith(l + "/") || g.away.id.startsWith(l + "/"))
    ))
  },
}
