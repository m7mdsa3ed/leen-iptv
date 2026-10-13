// node scripts/notify.check.ts - notifications: inbox de-dupe and caps, new-episode diff, match -> channel pick
import assert from "node:assert/strict"
import { addNote, channelFor, epDue, INBOX_MAX, newEpisodes, pruneInbox, watchingSeries, type Inbox, type Note } from "../src/lib/notify-pure.ts"

const DAY = 864e5, now = 1_800_000_000_000
const note = (key: string, at = now): Note => ({ key, kind: "kickoff", title: key, at })
const empty: Inbox = { list: [], seen: {} }

// inbox: a key fires once, survives Clear all (list emptied, seen kept), old marks expire
const a = addNote(empty, note("k1"))!
assert.equal(a.list.length, 1)
assert.equal(addNote(a, note("k1", now + 1000)), null, "duplicate key")
assert.equal(addNote({ ...a, list: [] }, note("k1", now + 1000)), null, "cleared inbox still remembers the key")
assert.ok(addNote(a, note("k1", now + 8 * DAY)), "a 7-day-old mark expires")
let box = empty
for (let i = 0; i < 70; i++) box = addNote(box, note(`n${i}`, now + i))!
assert.equal(box.list.length, INBOX_MAX)
assert.equal(box.list[0].key, "n69", "newest first")
assert.equal(Object.keys(box.seen).length, 70, "seen keeps every key, not only listed ones")
assert.deepEqual(pruneInbox({ list: [note("old", now - 8 * DAY), note("new")], seen: { old: now - 8 * DAY, new: now } }, now), { list: [note("new")], seen: { new: now } })

// new episodes: baseline first, then only past the last one, never backwards
const ep = (season: number, num: number) => ({ id: `s${season}e${num}`, season, num })
const r0 = newEpisodes(undefined, [ep(1, 1), ep(1, 2), ep(2, 1)], now)
assert.deepEqual(r0, { fresh: [], snap: { s: 2, e: 1, at: now } }, "first look = baseline")
const r1 = newEpisodes(r0.snap, [ep(1, 1), ep(2, 3), ep(2, 1), ep(2, 2)], now + 1)
assert.deepEqual(r1.fresh.map((e) => e.id), ["s2e2", "s2e3"])
assert.deepEqual(r1.snap, { s: 2, e: 3, at: now + 1 })
const r2 = newEpisodes(r1.snap, [ep(1, 1), ep(2, 1)], now + 2) // provider dropped episodes for a while
assert.deepEqual(r2, { fresh: [], snap: { s: 2, e: 3, at: now + 2 } }, "baseline never moves back")
assert.deepEqual(newEpisodes(r2.snap, [ep(1, 1), ep(2, 2), ep(2, 3)], now + 3).fresh, [], "returning episodes are not new")
assert.deepEqual(newEpisodes(r2.snap, [], now + 4), { fresh: [], snap: { s: 2, e: 3, at: now + 4 } }, "empty list keeps the baseline")
assert.deepEqual(newEpisodes(r2.snap, [ep(3, 1)], now + 5).fresh.map((e) => e.id), ["s3e1"], "new season")

// currently watching + throttle
const prog = { "a|series|1": { t: now - DAY }, "a|series|2": { t: now - 40 * DAY }, "a|ep|9": { t: now }, "b|series|3": { t: now - 1000 } }
assert.deepEqual(watchingSeries(prog, now), ["b|series|3", "a|series|1"])
assert.equal(epDue(undefined, now, false), true)
assert.equal(epDue({ s: 1, e: 1, at: now - 40 * 60000 }, now, true), true)
assert.equal(epDue({ s: 1, e: 1, at: now - 40 * 60000 }, now, false), false)

// match -> live channel
const live = [{ name: "AR| beIN Sports 1 HD" }, { name: "US: ESPN2" }, { name: "US: ESPN HD" }]
assert.equal(channelFor(["ESPN"], live)?.name, "US: ESPN HD", "exact name beats a prefix")
assert.equal(channelFor(["beIN SPORTS"], live)?.name, "AR| beIN Sports 1 HD")
assert.equal(channelFor(["NBC", "beIN SPORTS"], live)?.name, "AR| beIN Sports 1 HD", "next broadcaster when one has no channel")
assert.equal(channelFor(undefined, live), undefined)
assert.equal(channelFor(["TV"], live), undefined, "too short to match")

console.log("notify ok")
