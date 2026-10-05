// node scripts/sports.check.ts
import assert from "node:assert/strict"
import { LEAGUES, espnTeamId, splitTeamId, parseTeams, parseEvents, involving, norm, monthsBetween, competitionId, leagueOfId, refFor, registerLeague, isWomenLeague, teamKey, EXTRA_LEAGUES, parseMatch } from "../src/lib/sports/pure.ts"

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
assert.equal(registerLeague({ sport: "soccer", league: "conmebol.america", name: "Copa America" }).name, "Copa America")
assert.equal(refFor("soccer", "conmebol.america").name, "Copa America") // remembered

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
  assert.deepEqual(mm.stats, [{ label: "Possession", home: "45.1", away: "54.9" }, { label: "SHOTS", home: "14", away: "11" }])
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

console.log("sports ok")
