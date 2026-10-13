// node scripts/sports.check.ts
import assert from "node:assert/strict"
import { findSame, mergeGame, mergeGames, mergeMatch, nameWords, sameTeam } from "../src/lib/sports/merge-pure.ts"
import { parseFotmobDay, parseFotmobMatch } from "../src/lib/sports/fotmob-pure.ts"
import { parseKeyEvents, lineupsOf, formOf, h2hOf, parseStandings, espnDays, supportedSport, SPORTS, LEAGUES, espnTeamId, splitTeamId, parseTeams, parseEvents, involving, norm, monthsBetween, competitionId, leagueOfId, refFor, registerLeague, isWomenLeague, teamKey, EXTRA_LEAGUES, parseMatch } from "../src/lib/sports/pure.ts"

const pl = LEAGUES.find((l) => l.league === "eng.1")!

// league-qualified ids round-trip
assert.equal(espnTeamId("soccer", "eng.1", "364"), "soccer/eng.1/364")
assert.deepEqual(splitTeamId("soccer/eng.1/364"), { sport: "soccer", league: "eng.1", id: "364" })

// teams endpoint -> SportsTeam[] (badge from the first logo)
assert.deepEqual(
  parseTeams({ sports: [{ leagues: [{ teams: [
    { team: { id: "364", displayName: "Liverpool", logos: [{ href: "https://cdn/liv.png" }] } },
    { team: { id: "360", displayName: "Manchester United", abbreviation: "MUN" } },
  ] }] }] }, pl),
  [
    { id: "soccer/eng.1/364", name: "Liverpool", badge: "https://cdn/liv.png", league: "Premier League" },
    { id: "soccer/eng.1/360", name: "Manchester United", badge: undefined, league: "Premier League" },
  ],
)

// scoreboard / schedule events -> games, sorted, unparsable dates dropped
const games = parseEvents({ events: [
  { id: "b", date: "2026-03-02T17:30:00Z", competitions: [{ competitors: [
    { homeAway: "away", team: { id: "360", displayName: "Manchester United" }, score: "1" },
    { homeAway: "home", team: { id: "364", displayName: "Liverpool" }, score: "2" },
  ], status: { type: { state: "post", completed: true } }, venue: { fullName: "Anfield" } }] },
  { id: "a", date: "2026-03-01T12:00:00Z", competitions: [{ competitors: [
    { homeAway: "home", team: { id: "360", displayName: "Manchester United", logos: [{ href: "https://cdn/mun.png" }] } },
    { homeAway: "away", team: { id: "364", displayName: "Liverpool" } },
  ], status: { type: { state: "pre" } } }] },
  { id: "bad", date: "nope", competitions: [{ competitors: [{ homeAway: "home", team: {} }, { homeAway: "away", team: {} }] }] },
] }, pl)
assert.equal(games.length, 2) // the unparsable date is dropped
assert.equal(games[0].id, "a") // sorted by start time
assert.equal(games[0].status, "scheduled")
assert.equal(games[0].home.name, "Manchester United")
assert.equal(games[0].away.name, "Liverpool")
assert.equal(games[0].home.badge, "https://cdn/mun.png")
assert.equal(games[0].homeScore, undefined)
assert.equal(games[1].status, "final")
assert.equal(games[1].home.name, "Liverpool") // homeAway decides the side, not array order
assert.equal(games[1].away.name, "Manchester United")
assert.equal(games[1].homeScore, 2)
assert.equal(games[1].awayScore, 1)
assert.equal(games[1].venue, "Anfield")

// live state + the followed-team filter
const live = parseEvents({ events: [{ id: "c", date: "2026-03-01T12:00:00Z", competitions: [{ competitors: [
  { homeAway: "home", team: { id: "364", displayName: "Liverpool" }, score: "0" },
  { homeAway: "away", team: { id: "360", displayName: "Manchester United" }, score: "0" },
], status: { type: { state: "in", detail: "34'" } } }] }] }, pl)
assert.equal(live[0].status, "live")
assert.equal(involving(live, ["soccer/eng.1/364"]).length, 1)
assert.equal(involving(live, ["soccer/eng.1/999"]).length, 0)

// competition ids are "sport/league"
assert.equal(competitionId(pl), "soccer/eng.1")
assert.equal(leagueOfId("soccer/eng.1")!.name, "Premier League")
assert.equal(leagueOfId("soccer/nope")!.name, "nope") // an unknown league falls back to its slug
assert.equal(leagueOfId("soccer/eng.1/364"), undefined) // a team id is not a league
assert.equal(refFor("soccer", "fifa.world").name, "World Cup")
assert.equal(registerLeague({ sport: "soccer", league: "jpn.1", name: "J1 League" }).name, "J1 League")
assert.equal(refFor("soccer", "jpn.1").name, "J1 League") // remembered

// month buckets for the scoreboard query (inclusive of both ends)
assert.deepEqual(monthsBetween(Date.UTC(2026, 9, 4), Date.UTC(2026, 11, 3)), ["202610", "202611", "202612"])
assert.deepEqual(monthsBetween(Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 31)), ["202610"])
assert.deepEqual(monthsBetween(Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 5)), ["202610"])

// a match summary: header teams/scores + team-stat comparison
{
  const mm = parseMatch({ header: { competitions: [{ competitors: [
    { homeAway: "home", team: { id: "349", displayName: "Ipswich Town" }, score: "0" },
    { homeAway: "away", team: { id: "364", displayName: "Liverpool" }, score: "2", winner: true },
  ], status: { type: { state: "post", detail: "FT" } }, date: "2026-09-04T19:00:00Z" }] },
  boxscore: { teams: [
    { homeAway: "home", statistics: [{ name: "possessionPct", label: "Possession", displayValue: "45.1" }, { name: "totalShots", label: "SHOTS", displayValue: "14" }] },
    { homeAway: "away", statistics: [{ name: "possessionPct", label: "Possession", displayValue: "54.9" }, { name: "totalShots", label: "SHOTS", displayValue: "11" }] },
  ] },
  gameInfo: { venue: { fullName: "Portman Road" }, attendance: 29000, officials: [{ displayName: "A. Ref" }] } }, LEAGUES.find((l) => l.league === "eng.1")!, "401879288")
  assert.equal(mm.status, "final")
  assert.equal(mm.detail, "FT")
  assert.equal(mm.home.team.name, "Ipswich Town")
  assert.equal(mm.away.score, 2)
  assert.equal(mm.away.winner, true)
  assert.equal(mm.venue, "Portman Road")
  assert.deepEqual(mm.stats, [{ label: "Possession", home: "45.1", away: "54.9", key: "possessionPct" }, { label: "SHOTS", home: "14", away: "11", key: "totalShots" }])
}

// a team is the same team across competitions (a follow in one league sees its cup/foreign games)
assert.equal(teamKey("soccer/caf.nations_qual/2620"), "soccer:2620")
assert.equal(teamKey("soccer/fifa.friendly/2620"), "soccer:2620")
const fr = parseEvents({ events: [{ id: "x", date: "2026-10-04T18:00:00Z", competitions: [{ competitors: [
  { homeAway: "home", team: { id: "2620", displayName: "Egypt" } },
  { homeAway: "away", team: { id: "467", displayName: "South Africa" } },
] }] }] }, EXTRA_LEAGUES[0])
assert.equal(involving(fr, ["soccer/caf.nations_qual/2620"]).length, 1)

// women's leagues are told apart by their slug (eng.w.1 vs eng.1)
assert.equal(isWomenLeague("eng.w.1"), true)
assert.equal(isWomenLeague("caf.w.nations"), true)
assert.equal(isWomenLeague("eng.1"), false)
assert.equal(isWomenLeague("usa.nwsl"), false)

// loose name matching
assert.equal(norm("Atlético"), "atletico")

// ---- match details: key events, line-ups, form, head to head; standings; ESPN days
assert.deepEqual(parseKeyEvents([
  { type: { type: "kickoff" } },
  { type: { type: "goal" }, scoringPlay: true, team: { id: "357" }, clock: { displayValue: "34'" }, participants: [{ athlete: { displayName: "Noah Okafor" } }] },
  { type: { type: "yellow-card" }, team: { id: "367" }, clock: { displayValue: "41'" }, participants: [{ athlete: { displayName: "João Palhinha" } }] },
  { type: { type: "own-goal" }, scoringPlay: true, team: { id: "367" }, clock: { displayValue: "60'" }, participants: [] },
  { type: { type: "penalty---scored" }, scoringPlay: true, team: { id: "357" }, clock: { displayValue: "90'+2'" }, participants: [{ athlete: { displayName: "X" } }] },
  { type: { type: "substitution" }, team: { id: "357" }, clock: { displayValue: "70'" }, participants: [{ athlete: { displayName: "In" } }, { athlete: { displayName: "Out" } }] },
], "357").map((e) => `${e.minute} ${e.kind} ${e.side} ${e.players.join("/")}`), ["34' goal home Noah Okafor", "41' yellow away João Palhinha", "60' og away ", "90'+2' pen home X", "70' sub home In/Out"])
const lu = lineupsOf([
  { homeAway: "home", formation: "4-3-3", roster: [{ starter: true, formationPlace: 2, jersey: "2", athlete: { displayName: "B" } }, { starter: true, formationPlace: 1, jersey: "1", position: { abbreviation: "G" }, athlete: { displayName: "A" } }, { starter: false, subbedIn: true, athlete: { displayName: "C" } }] },
  { homeAway: "away", roster: [{ starter: true, athlete: { displayName: "D" } }] },
])!
assert.deepEqual(lu.lineups.home, { formation: "4-3-3", starters: [{ name: "A", number: "1", pos: "G" }, { name: "B", number: "2" }], bench: [{ name: "C", subIn: true }] })
assert.equal(lineupsOf([{ homeAway: "home", roster: [] }]), undefined) // no line-ups yet
assert.deepEqual(formOf([{ team: { id: "357" }, events: [
  { gameResult: "L", gameDate: "2025-08-26T19:00Z", score: "1-1", opponent: { displayName: "Sheffield Wednesday" }, homeTeamId: "399" },
  { gameResult: "W", gameDate: "2025-09-01T19:00Z", score: "2-0", opponent: { displayName: "Fulham" }, homeTeamId: "357", opponentLogo: "https://cdn/f.png" },
  { gameResult: "?", gameDate: "2025-09-02T19:00Z" },
] }], "357").map((f) => `${f.result} ${f.opp} ${f.home}`), ["W Fulham true", "L Sheffield Wednesday false"])
assert.deepEqual(h2hOf([{ type: "head-to-head", summary: "TOT leads series 4-1", events: [{ date: "2023-05-28T15:30:00Z", competitors: [{ homeAway: "home", score: "1", team: { displayName: "Leeds" } }, { homeAway: "away", score: "4", team: { displayName: "Spurs" } }] }] }]),
  { h2h: { summary: "TOT leads series 4-1", games: [{ at: Date.parse("2023-05-28T15:30:00Z"), home: "Leeds", away: "Spurs", homeScore: 1, awayScore: 4 }] } })
assert.deepEqual(h2hOf(undefined), {})
const stat = (name: string, abbreviation: string, displayValue: string, value?: number) => ({ name, abbreviation, displayValue, value })
const tables = parseStandings({ name: "PL", children: [{ name: "Group A", standings: { entries: [
  { team: { id: "2", displayName: "Second" }, stats: [stat("rank", "R", "2", 2), stat("gamesPlayed", "GP", "6"), stat("points", "P", "15")] },
  { team: { id: "1", displayName: "First" }, note: { description: "Champions League", color: "#81D6AC" }, stats: [stat("rank", "R", "1", 1), stat("gamesPlayed", "GP", "6"), stat("points", "P", "18")] },
] } }] }, pl)
assert.deepEqual(tables.map((g) => [g.name, g.cols, g.rows.map((r) => [r.rank, r.team.name, r.values, r.note])]), [["Group A", ["GP", "P"], [[1, "First", ["6", "18"], "Champions League"], [2, "Second", ["6", "15"], undefined]]]])
assert.deepEqual(parseStandings({}, pl), [])
for (const c of espnDays(Date.now())) assert.match(c, /^\d{8}$/)
assert.ok(espnDays(Date.now()).length >= 1 && espnDays(Date.now()).length <= 2)
assert.ok(supportedSport("soccer") && !supportedSport("cricket"))
assert.ok(LEAGUES.every((l) => (SPORTS as readonly string[]).includes(l.sport)))
assert.equal(new Set(LEAGUES.map((l) => `${l.sport}/${l.league}`)).size, LEAGUES.length) // no duplicates

// --- multi-source: same team / same game across providers
assert.deepEqual(nameWords("CF Montréal"), ["montreal"])
assert.ok(sameTeam("Atlanta United FC", "Atlanta United"))
assert.ok(sameTeam("Orlando City SC", "Orlando City"))
assert.ok(sameTeam("Tottenham", "Tottenham Hotspur"))
assert.ok(sameTeam("Brighton & Hove Albion", "Brighton and Hove Albion"))
assert.ok(!sameTeam("Arsenal", "Arsenal Women")) // another side, not a fuller name
assert.ok(!sameTeam("New York City FC", "New York Red Bulls"))
assert.ok(!sameTeam("Manchester City", "Manchester United"))
assert.ok(sameTeam("D.C. United", "DC United"))
assert.ok(sameTeam("TSG Hoffenheim", "Hoffenheim") && sameTeam("AJ Auxerre", "Auxerre") && sameTeam("Deportivo Alavés", "Alavés"))
assert.ok(sameTeam("FC Cologne", "1. FC Köln") && sameTeam("Internazionale", "Inter") && sameTeam("LAFC", "Los Angeles FC") && sameTeam("Hamburg SV", "Hamburger SV"))
assert.ok(!sameTeam("Real Madrid", "Atlético Madrid"))
assert.ok(!sameTeam("Arsenal", "Arsenal Women") && !sameTeam("Barcelona", "Barcelona B"))
const ko = Date.parse("2026-09-26T23:30:00Z")
const fmDay = parseFotmobDay({ leagues: [{ name: "Major League Soccer", matches: [
  { id: 5071381, home: { id: 1, name: "Atlanta United", score: 2 }, away: { id: 2, name: "New York City FC", score: 2 }, status: { utcTime: "2026-09-26T23:30:00.000Z", finished: true, started: true } },
  { id: 5071390, home: { id: 3, name: "Los Angeles FC" }, away: { id: 4, name: "FC Dallas" }, status: { utcTime: "2026-09-27T00:30:00.000Z" } },
  { id: 9, home: { id: 5, name: "Atlanta United II" }, away: { id: 6, name: "Inter Miami II" }, status: { utcTime: "2026-09-26T23:30:00.000Z" } },
  { id: "bad", home: {}, away: {}, status: { utcTime: "nope" } },
] }] })
assert.equal(fmDay.length, 3) // unparsable time dropped
assert.deepEqual([fmDay[0].status, fmDay[0].homeScore, fmDay[0].home.id], ["final", 2, "fotmob/1"])
assert.equal(findSame({ startMs: ko, home: "Atlanta United FC", away: "New York City FC" }, fmDay)?.id, "5071381") // both sides
assert.equal(findSame({ startMs: ko + 3600_000, home: "LAFC", away: "FC Dallas" }, fmDay)?.id, "5071390") // one side at the same kick-off
assert.equal(findSame({ startMs: ko + 5 * 3600_000, home: "LAFC", away: "FC Dallas" }, fmDay), undefined) // one side, 4 h off: not enough
assert.equal(findSame({ startMs: ko + 2 * 3600_000, home: "Atlanta United FC", away: "New York City FC" }, fmDay)?.id, "5071381") // both sides, 2 h off
assert.equal(findSame({ startMs: ko, home: "Chelsea", away: "Fulham" }, fmDay), undefined)

// FotMob match details -> SportsMatch
const fm = parseFotmobMatch({
  general: { matchId: "5071381", leagueName: "Major League Soccer", matchTimeUTCDate: "2026-09-26T23:30:00.000Z", homeTeam: { id: 1, name: "Atlanta United" }, awayTeam: { id: 2, name: "New York City FC" } },
  header: { teams: [{ id: 1, name: "Atlanta United", score: 2, imageUrl: "https://img/1.png" }, { id: 2, name: "New York City FC", score: 1 }], status: { finished: true, started: true, reason: { short: "FT" } } },
  content: {
    matchFacts: {
      infoBox: { Stadium: { name: "Mercedes-Benz Stadium" }, Attendance: 45000, Referee: { text: "Ref One" } },
      events: { events: [
        { type: "Goal", time: 5, isHome: false, ownGoal: true, nameStr: "Matthew Edwards" },
        { type: "Goal", time: 10, isHome: true, nameStr: "Giuliano Galoppo", assistInput: "Tomás Jacob" },
        { type: "Goal", time: 90, overloadTime: 5, isHome: true, nameStr: "Pen Taker", goalDescriptionKey: "penalty" },
        { type: "Card", time: 43, isHome: true, nameStr: "Luke Brennan", card: "Yellow" },
        { type: "Card", time: 80, isHome: false, nameStr: "Off Again", card: "YellowRed" },
        { type: "Substitution", time: 55, isHome: true, swap: [{ name: "Daniel Chica" }, { name: "Tomás Jacob" }] },
        { type: "Half", time: 45 },
        { type: "Goal", time: 120, isHome: true, nameStr: "Shootout", isPenaltyShootoutEvent: true },
      ] },
      teamForm: [[{ resultString: "W", score: "2 - 0", date: { utcTime: "2026-09-20T00:00:00Z" }, imageUrl: "https://img/9.png", home: { name: "Atlanta United", isOurTeam: true }, away: { name: "Toronto FC" } }], []],
    },
    stats: { Periods: { All: { stats: [
      { key: "top_stats", stats: [{ key: "BallPossesion", title: "Ball possession", stats: [55, 45] }, { key: "expected_goals", title: "Expected goals (xG)", stats: ["1.80", "0.90"] }] },
      { key: "shots", stats: [{ key: "shots", title: "Shots", type: "title", stats: [null, null] }, { key: "total_shots", title: "Total shots", stats: [12, 8] }] },
      { key: "expected_goals", stats: [{ key: "expected_goals", title: "Expected goals (xG)", stats: ["1.80", "0.90"] }] },
    ] } } },
    lineup: {
      homeTeam: { formation: "4-3-3", starters: [{ name: "GK One", shirtNumber: "1" }, { name: "Tomás Jacob", shirtNumber: "8", performance: { substitutionEvents: [{ type: "subOut" }] } }], subs: [{ name: "Daniel Chica", shirtNumber: "44", performance: { substitutionEvents: [{ type: "subIn" }] } }] },
      awayTeam: { starters: [{ name: "Away GK" }], subs: [] },
    },
    h2h: { matches: [
      { status: { utcTime: "2025-05-01T00:00:00Z", finished: true, scoreStr: "0 - 1" }, home: { name: "New York City FC" }, away: { name: "Atlanta United" } },
      { status: { utcTime: "2027-05-01T00:00:00Z", finished: false, scoreStr: "" }, home: { name: "Atlanta United" }, away: { name: "New York City FC" } },
    ] },
  },
})!
assert.equal(fm.status, "final")
assert.equal(fm.detail, "FT")
assert.ok(fm.home.winner && !fm.away.winner)
assert.equal(fm.home.team.badge, "https://img/1.png")
assert.deepEqual([fm.venue, fm.attendance, fm.officials], ["Mercedes-Benz Stadium", "45000", ["Ref One"]])
assert.deepEqual(fm.events.map((e) => `${e.kind}:${e.side}:${e.minute}:${e.players.join("/")}`), [
  "og:away:5':Matthew Edwards", "goal:home:10':Giuliano Galoppo/Tomás Jacob", "pen:home:90'+5':Pen Taker",
  "yellow:home:43':Luke Brennan", "red:away:80':Off Again", "sub:home:55':Daniel Chica/Tomás Jacob",
]) // half markers and shoot-out kicks left out
assert.deepEqual(fm.stats.map((r) => r.key), ["BallPossesion", "expected_goals", "total_shots"]) // titles skipped, first of each key
assert.deepEqual(fm.lineups?.home, { formation: "4-3-3", starters: [{ name: "GK One", number: "1" }, { name: "Tomás Jacob", number: "8", subOut: true }], bench: [{ name: "Daniel Chica", number: "44", subIn: true }] })
assert.deepEqual(fm.form.home, [{ result: "W", score: "2 - 0", opp: "Toronto FC", oppBadge: "https://img/9.png", at: Date.parse("2026-09-20T00:00:00Z"), home: true }])
assert.deepEqual(fm.h2h, { games: [{ at: Date.parse("2025-05-01T00:00:00Z"), home: "New York City FC", away: "Atlanta United", homeScore: 0, awayScore: 1 }] }) // unplayed meeting left out
assert.equal(parseFotmobMatch({ error: "blocked" }), null)

// merge: the primary wins, the alt fills its gaps; the same stat from two providers shows once
const prim = { id: "761830", league: "MLS", startMs: ko, status: "live" as const, detail: "88'", home: { team: { id: "soccer/usa.1/18418", name: "Atlanta United FC" }, score: 1 }, away: { team: { id: "soccer/usa.1/17606", name: "New York City FC" }, score: 1 }, table: [], lineups: undefined, stats: [{ label: "Possession", home: "45", away: "55", key: "possessionPct" }], events: [], form: { home: [], away: [] }, officials: [], tv: ["ESPN+"], sources: ["ESPN"] }
const merged = mergeMatch(prim, { ...fm, sources: ["FotMob"], tv: ["ESPN+", "Apple TV"] })
assert.equal(merged.id, prim.id) // ids/routes stay the primary's
assert.equal(merged.home.team.id, prim.home.team.id)
assert.deepEqual([merged.status, merged.detail, merged.home.score, merged.away.score, merged.home.winner], ["final", "FT", 2, 1, true]) // alt is further along
assert.deepEqual(merged.stats.map((r) => r.key), ["possessionPct", "expected_goals", "total_shots"]) // BallPossesion = possessionPct, dropped
assert.equal(merged.stats[0].home, "45") // the primary's value wins
assert.equal(merged.events.length, 6) // primary had none
assert.deepEqual(merged.lineups, fm.lineups) // primary had none
assert.equal(merged.home.team.badge, "https://img/1.png") // badge filled, name kept
assert.equal(merged.home.team.name, "Atlanta United FC")
assert.deepEqual(merged.officials, ["Ref One"])
assert.deepEqual(merged.tv, ["ESPN+", "Apple TV"])
assert.deepEqual(merged.sources, ["ESPN", "FotMob"])
const kept = mergeMatch({ ...prim, status: "final", detail: "FT", events: [fm.events[1]] }, { ...fm, status: "live", detail: "70'" })
assert.deepEqual([kept.status, kept.detail, kept.home.score, kept.events.length], ["final", "FT", 1, 1]) // primary ahead: its score/status/events stay
assert.equal(mergeMatch(prim, null), prim)

// game lists: FotMob's day rows fill ESPN's (live minute, red cards); both teams must match there
const fmLive = parseFotmobDay({ leagues: [{ name: "Premier League", matches: [
  { id: 1, home: { id: 10, name: "Liverpool", score: 2 }, away: { id: 11, name: "Everton", score: 0 }, status: { utcTime: "2026-10-03T14:00:00.000Z", started: true, liveTime: { short: "63'" }, numberOfHomeRedCards: 0, numberOfAwayRedCards: 2 } },
  { id: 2, home: { id: 12, name: "Inter", score: 1 }, away: { id: 13, name: "Napoli", score: 0 }, status: { utcTime: "2026-10-03T14:00:00.000Z", finished: true, started: true, reason: { short: "FT" } } },
] }] })
assert.deepEqual([fmLive[0].status, fmLive[0].detail, fmLive[0].homeRed, fmLive[0].awayRed], ["live", "63'", undefined, 2]) // 0 = left out
assert.equal(fmLive[1].detail, "FT")
const at3 = Date.parse("2026-10-03T14:00:00Z")
const espnRows = [
  { id: "e1", home: { id: "soccer/eng.1/364", name: "Liverpool" }, away: { id: "soccer/eng.1/368", name: "Everton" }, startMs: at3, status: "live" as const, homeScore: 2, awayScore: 0, tv: ["NBC"] },
  { id: "e2", home: { id: "soccer/ita.1/110", name: "Internazionale" }, away: { id: "soccer/ita.1/114", name: "Napoli" }, startMs: at3, status: "live" as const, homeScore: 0, awayScore: 0 },
  { id: "e3", home: { id: "soccer/eng.1/1", name: "Chelsea" }, away: { id: "soccer/eng.1/2", name: "Fulham" }, startMs: at3, status: "scheduled" as const },
]
const rows = mergeGames(espnRows, fmLive)
assert.deepEqual([rows[0].id, rows[0].detail, rows[0].awayRed, rows[0].homeRed, rows[0].tv], ["e1", "63'", 2, undefined, ["NBC"]]) // filled, ids kept
assert.equal(rows[1].detail, "FT") // "Internazionale" = "Inter" (alias): both sides match
assert.equal(rows[2], espnRows[2]) // no FotMob game: untouched
assert.equal(findSame({ startMs: at3, home: "Nerazzurri", away: "Napoli" }, fmLive)?.id, "2") // one side at the same kick-off: the match page finds it
assert.equal(findSame({ startMs: at3, home: "Nerazzurri", away: "Napoli" }, fmLive, true), undefined) // lists need both sides
const ahead = mergeGame({ ...espnRows[0], detail: "60'" }, { ...fmLive[0], status: "final", detail: "FT", homeScore: 3, awayScore: 0 })
assert.deepEqual([ahead.status, ahead.detail, ahead.homeScore], ["final", "FT", 3]) // alt further along: its status/score/detail
const behind = mergeGame({ ...espnRows[0], status: "final", detail: "FT", homeScore: 3 }, fmLive[0])
assert.deepEqual([behind.status, behind.detail, behind.homeScore, behind.awayRed], ["final", "FT", 3, 2]) // primary ahead: keeps its own, still gets red cards
assert.equal(mergeGames(espnRows, []), espnRows)

console.log("sports ok")
