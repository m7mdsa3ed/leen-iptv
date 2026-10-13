// Several sports providers, one view: find the same game in another provider's list, and merge two summaries of one match
// (the primary's values win, the alt fills what the primary lacks). Pure: `node scripts/sports.check.ts`.
import type { GameStatus, MatchSide, MatchStatRow, SportsGame, SportsMatch } from "./types.ts"
import { norm } from "./pure.ts"

const NOISE = new Set(["fc", "cf", "afc", "sc", "ac", "cd", "club", "de", "the"])
// a longer name with one of these extra words is another team (women / youth / reserves), not a fuller name of the same one
const OTHER = new Set(["women", "w", "u17", "u18", "u19", "u20", "u21", "u23", "ii", "b", "reserves", "youth"])

// one provider's word for a club -> the other's (exonyms and nicknames the start/end rule cannot see)
// ponytail: hand-picked from real ESPN/FotMob misses; add a pair when a big club keeps failing to match
const ALIAS: Record<string, string[]> = { internazionale: ["inter"], cologne: ["koln"], hamburger: ["hamburg"], rennais: ["rennes"], lafc: ["los", "angeles"] }

const words = new Map<string, string[]>() // ponytail: never cleared; bounded by the distinct team names seen in a session (a few thousand)
/** A team name as comparable words: lower case, no accents/punctuation ("D.C." = dc), no FC/SC/club noise, aliases
 *  applied ("CF Montréal" -> montreal, "1. FC Köln" -> 1 koln, "FC Cologne" -> koln). */
export function nameWords(name: string): string[] {
  let w = words.get(name)
  if (!w) words.set(name, w = norm(name).replace(/\./g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
    .filter((x) => x && !NOISE.has(x)).flatMap((x) => ALIAS[x] ?? [x]))
  return w
}

/** Same team under two providers' names: equal words, or one is the start or the end of the other ("Tottenham" /
 *  "Tottenham Hotspur", "Hoffenheim" / "TSG Hoffenheim") unless the extra words name another side ("Arsenal" / "Arsenal Women"). */
export function sameTeam(a: string, b: string): boolean {
  const wa = nameWords(a), wb = nameWords(b)
  if (!wa.length || !wb.length) return false
  const [s, l] = wa.length <= wb.length ? [wa, wb] : [wb, wa]
  const n = l.length - s.length
  const start = s.every((w, i) => l[i] === w), end = s.every((w, i) => l[n + i] === w)
  const extra = start ? l.slice(s.length) : l.slice(0, n)
  return (start || end) && !extra.some((w) => OTHER.has(w))
}

const SLOT = 15 * 60000, WINDOW = 3 * 3600_000
/** The game in `games` that is this fixture: both teams match within 3 h of kick-off, or one team at the same kick-off
 *  (names like "LAFC" / "Los Angeles FC" never match; a team does not play twice in one slot).
 *  `both` = only the both-teams rule (lists: a wrong pick there would paint another game's score on a row nobody opened).
 *  ponytail: home/away must agree; a neutral-venue swap is missed (the merge would need to flip every side-keyed field). */
export function findSame<T extends { startMs: number; home: { name: string }; away: { name: string } }>(m: { startMs: number; home: string; away: string }, games: T[], both = false): T | undefined {
  let best: T | undefined, score = 0
  for (const g of games) {
    const dt = Math.abs(g.startMs - m.startMs)
    if (dt > WINDOW) continue
    const n = Number(sameTeam(m.home, g.home.name)) + Number(sameTeam(m.away, g.away.name))
    const s = n === 2 ? 2 : n === 1 && dt <= SLOT && !both ? 1 : 0
    if (s > score) { best = g; score = s }
  }
  return best
}

/** Providers' own stat names -> one shared name, so the same stat from two providers shows once. Unlisted names stay as they are. */
export const STAT_KEY: Record<string, string> = {
  possessionPct: "possession", BallPossesion: "possession",
  totalShots: "shots", total_shots: "shots",
  shotsOnTarget: "onTarget", ShotsOnTarget: "onTarget",
  wonCorners: "corners", corners: "corners",
  foulsCommitted: "fouls", fouls: "fouls",
  yellowCards: "yellow", yellow_cards: "yellow",
  redCards: "red", red_cards: "red",
  offsides: "offsides", Offsides: "offsides",
  saves: "saves", keeper_saves: "saves",
  totalPasses: "passes", passes: "passes",
  accurateCrosses: "crosses", accurate_crosses: "crosses",
}
const statKey = (r: MatchStatRow) => STAT_KEY[r.key ?? ""] ?? r.key ?? norm(r.label)
const RANK: Record<GameStatus, number> = { scheduled: 0, live: 1, final: 2 }

/** `a` with the gaps filled from `b` (the same match from another provider; home/away must agree, see findSame).
 *  Ids, names and routes stay `a`'s; status/score come from whichever is further along (final > live > scheduled);
 *  stats are `a`'s rows plus `b`'s rows `a` lacks; lists `a` left empty (events, line-ups, form, h2h, table, officials) come from `b`. */
export function mergeMatch(a: SportsMatch, b: SportsMatch | null | undefined): SportsMatch {
  if (!b) return a
  const ahead = RANK[b.status] > RANK[a.status]
  const side = (x: MatchSide, y: MatchSide): MatchSide => ({
    team: { ...x.team, badge: x.team.badge ?? y.team.badge },
    score: ahead ? y.score : x.score ?? y.score,
    winner: ahead ? y.winner : x.winner,
  })
  const seen = new Set(a.stats.map(statKey))
  const extra = b.stats.filter((r) => { const k = statKey(r); if (seen.has(k)) return false; seen.add(k); return true })
  return {
    ...a,
    league: a.league ?? b.league,
    status: ahead ? b.status : a.status,
    detail: ahead ? b.detail : a.detail ?? b.detail,
    venue: a.venue ?? b.venue,
    attendance: a.attendance ?? b.attendance,
    officials: a.officials.length ? a.officials : b.officials,
    home: side(a.home, b.home),
    away: side(a.away, b.away),
    stats: [...a.stats, ...extra],
    events: a.events.length ? a.events : b.events,
    lineups: a.lineups ?? b.lineups,
    form: { home: a.form.home.length ? a.form.home : b.form.home, away: a.form.away.length ? a.form.away : b.form.away },
    h2h: a.h2h?.games.length ? a.h2h : b.h2h ?? a.h2h,
    tv: [...new Set([...a.tv, ...b.tv])],
    table: a.table.length ? a.table : b.table,
    note: a.note ?? b.note,
    sources: [...(a.sources ?? []), ...(b.sources ?? [])],
  }
}

/** One list row with the gaps filled from the same game in another provider's list: status/score from whichever is
 *  further along, then detail (live minute), red cards, venue, note, badges and TV where `a` has none. Ids stay `a`'s. */
export function mergeGame(a: SportsGame, b: SportsGame | undefined): SportsGame {
  if (!b) return a
  const ahead = RANK[b.status] > RANK[a.status]
  const tv = [...new Set([...(a.tv ?? []), ...(b.tv ?? [])])]
  const fill = <K extends "detail" | "homeRed" | "awayRed" | "venue" | "note">(k: K) => (a[k] ?? b[k]) != null ? { [k]: a[k] ?? b[k] } : {}
  return {
    ...a,
    status: ahead ? b.status : a.status,
    homeScore: ahead ? b.homeScore : a.homeScore ?? b.homeScore,
    awayScore: ahead ? b.awayScore : a.awayScore ?? b.awayScore,
    ...(ahead ? (b.detail ? { detail: b.detail } : {}) : fill("detail")),
    ...fill("homeRed"), ...fill("awayRed"), ...fill("venue"), ...fill("note"),
    home: { ...a.home, badge: a.home.badge ?? b.home.badge },
    away: { ...a.away, badge: a.away.badge ?? b.away.badge },
    ...(tv.length ? { tv } : {}),
  }
}

/** Every row of `a` merged with its game in `b` (both teams must match, see findSame). */
export const mergeGames = (a: SportsGame[], b: SportsGame[]): SportsGame[] =>
  b.length ? a.map((g) => mergeGame(g, findSame({ startMs: g.startMs, home: g.home.name, away: g.away.name }, b, true))) : a
