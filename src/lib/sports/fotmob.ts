// FotMob adapter for the SportsProvider port: football only, keyless, unofficial (www.fotmob.com/api/data sends no CORS
// headers, so requests go through px). It is never followed or browsed: `lookup` finds another provider's match in FotMob's
// day list and returns FotMob's version (xG and the other extra stats, line-ups, events, form) for matchSummary to merge;
// `around` returns FotMob's day lists for another provider's game lists (withAlts: live minute, red cards).
// Any failure (blocked, shape changed, not found) is null / [], and the screen keeps the primary provider's data.
import { fetchT, px } from "@/lib/net"
import { cached } from "@/lib/meta/cache"
import type { SportsConfig, SportsGame, SportsProvider } from "./types"
import { findSame } from "./merge-pure"
import { parseFotmobDay, parseFotmobMatch } from "./fotmob-pure"

const BASE = "https://www.fotmob.com/api/data"
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const get = async (u: string, cfg: SportsConfig): Promise<J> => (await fetchT(px(u, cfg.proxy ?? ""), 15000)).json()
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "")
const dayAt = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))
/** Every game FotMob lists on one UTC day. Today's list carries live scores/minutes (60 s, like ESPN's day view);
 *  the days beside it may still gain fixtures (10 min); older/later ones only map teams + kick-off to ids (6 h). */
const dayList = (day: string, cfg: SportsConfig): Promise<SportsGame[]> => {
  const off = Math.abs(dayAt(day) - dayAt(utcDay(Date.now())))
  const ttl = off === 0 ? 60000 : off <= 864e5 ? 10 * 60000 : 6 * 3600_000
  return cached(`fm:d:${day}`, ttl, async () => parseFotmobDay(await get(`${BASE}/matches?date=${day}&timezone=UTC`, cfg)))
}

export const fotmob: SportsProvider = {
  id: "fotmob",
  name: "FotMob",
  needsKey: false,

  // The football games among `games` (ids are "sport/league/id", see games.ts sportOf) decide which UTC days to read.
  // ponytail: at most the 3 days nearest now (a day view spans 2); a 30-day followed list only gets its near games filled.
  async around(games, cfg) {
    const dist = new Map<string, number>()
    for (const g of games) {
      if (!g.home.id.startsWith("soccer/")) continue
      const d = utcDay(g.startMs), x = Math.abs(g.startMs - Date.now())
      dist.set(d, Math.min(dist.get(d) ?? x, x))
    }
    const days = [...dist].sort((a, b) => a[1] - b[1]).slice(0, 3).map(([d]) => d)
    return (await Promise.all(days.map((d) => dayList(d, cfg).catch(() => [] as SportsGame[])))).flat()
  },

  async lookup(m, ref, cfg) {
    if (ref.sport !== "soccer" || !m.startMs) return null
    const games = await dayList(utcDay(m.startMs), cfg).catch(() => [] as SportsGame[])
    const hit = findSame({ startMs: m.startMs, home: m.home.team.name, away: m.away.team.name }, games)
    if (!hit) return null
    // 2-min cache like ESPN's summary, so the match page's 30 s live poll costs at most one request per 2 min
    return cached(`fm:m:${hit.id}`, 120000, async () => parseFotmobMatch(await get(`${BASE}/matchDetails?matchId=${hit.id}`, cfg))).catch(() => null)
  },
}
