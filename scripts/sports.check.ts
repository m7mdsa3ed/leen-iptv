// node scripts/sports.check.ts
import assert from "node:assert/strict"
import { LEAGUES, espnTeamId, splitTeamId, parseTeams, parseEvents, involving, norm, monthsBetween, competitionId, leagueOfId } from "../src/lib/sports/pure.ts"

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
assert.equal(leagueOfId("soccer/nope"), undefined)
assert.equal(leagueOfId("soccer/eng.1/364"), undefined) // a team id is not a league

// month buckets for the scoreboard query (inclusive of both ends)
assert.deepEqual(monthsBetween(Date.UTC(2026, 9, 4), Date.UTC(2026, 11, 3)), ["202610", "202611", "202612"])
assert.deepEqual(monthsBetween(Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 31)), ["202610"])
assert.deepEqual(monthsBetween(Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 5)), ["202610"])

// loose name matching
assert.equal(norm("Atlético"), "atletico")

console.log("sports ok")
