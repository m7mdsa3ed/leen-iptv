// node scripts/stats.check.ts
import assert from "node:assert/strict"
import { computeStats, dayKey, level, type Day, type Session } from "../src/lib/stats.ts"

const now = new Date(2026, 9, 10, 20, 0).getTime()
const day = (n: number) => dayKey(now - n * 864e5)
const days: Record<string, Day> = {
  [day(0)]: { sec: 3600, sessions: 2, live: 600, movie: 3000, series: 0 },
  [day(1)]: { sec: 1800, sessions: 1, live: 0, movie: 0, series: 1800 },
  [day(3)]: { sec: 600, sessions: 1, live: 600, movie: 0, series: 0 },
}
const s = (o: Partial<Session>): Session => ({ id: "x", item: "a", kind: "movie", name: "A", group: "G", src: "s", start: now, sec: 100, stalls: 0, errors: 0, ...o })
const st = computeStats([s({ sec: 3000, stalls: 3 }), s({ item: "e1", kind: "episode", name: "S1E1", group: "Show", sec: 900 }), s({ item: "e2", kind: "episode", name: "S1E2", group: "Show", sec: 900, errors: 1, startupMs: 2000, q: "poor" })], days, now)
assert.equal(st.total, 6000)
assert.equal(st.week, 6000)
assert.equal(st.streak, 2) // today + yesterday, gap on day 2
assert.equal(st.topTitles[0].name, "A")
assert.equal(st.topTitles[1].name, "Show") // both episodes roll up into the series
assert.equal(st.topTitles[1].sec, 1800)
assert.equal(st.health.errors, 1)
assert.equal(st.health.avgStartupMs, 2000)
assert.equal(st.health.quality.poor, 1)
assert.equal(st.hours[20], 4800)
assert.equal(st.heat[new Date(now).getDay()][20], 4800) // weekday x hour grid
assert.equal(st.calendar.length, 18)
assert.equal(st.calendar[17][new Date(now).getDay()]?.sec, 3600) // today is in the last column
assert.equal(st.calendar[17][(new Date(now).getDay() + 1) % 7 === 0 ? 0 : 6] === undefined, false)
assert.equal(level(0, 10), 0)
assert.equal(level(10, 10), 4)
assert.equal(level(1, 10), 1)
assert.equal(computeStats([], {}, now).hasData, false)
console.log("stats ok")
