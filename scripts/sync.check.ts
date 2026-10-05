// node scripts/sync.check.ts
import assert from "node:assert/strict"
import { applySnapshot, buildSnapshot, clockSkewMin, dupSources, emptySnap, mergeSummary, flatten, merge, stable, stamp, type AppSlice, type Stamp } from "../src/lib/sync/merge.ts"

const slice = (o: Partial<AppSlice> = {}): AppSlice => ({ profiles: [{ id: "p1", name: "Me" } as never], sources: [], data: { p1: { favs: [], recents: [], progress: {} } }, settings: { theme: "system", trackHistory: true }, ...o })
const same = (a: unknown, b: unknown) => assert.equal(stable(a), stable(b))

// device A starts, stamps t=0; B identical
let eA: Record<string, Stamp> = stamp({}, flatten(slice()), 0)
const A0 = buildSnapshot(slice(), eA, {}, 1000)

// A favorites x at t=10, then removes y
let a = slice({ data: { p1: { favs: ["x", "y"], recents: [], progress: { m1: { pos: 5, dur: 100, t: 50 } } } } })
eA = stamp(eA, flatten(a), 10)
a = slice({ data: { p1: { favs: ["x"], recents: [], progress: { m1: { pos: 5, dur: 100, t: 50 } } } } })
eA = stamp(eA, flatten(a), 20)
assert.equal(eA["f/p1/y"].del, 1)
const SA = buildSnapshot(a, eA, {}, 30)

// B: favorites y (t=15, before A's removal), z (t=16); progress newer on m1; source added; theme changed
let b = slice({ data: { p1: { favs: ["z", "y"], recents: [], progress: { m1: { pos: 90, dur: 100, t: 60 } } } }, sources: [{ id: "s1", name: "S" } as never], settings: { theme: "dark", trackHistory: true } })
let eB = stamp(stamp({}, flatten(slice()), 0), flatten(b), 16)
const SB = buildSnapshot(b, eB, { "p1/2026-01-01": { sec: 5, sessions: 1, live: 0, movie: 5, series: 0 } }, 30)

const M = merge(SA, SB)
same(M, merge(SB, SA)) // commutative
same(merge(M, M), M) // idempotent
same(merge(M, SA), M)
assert.equal(M.e["f/p1/y"].del, 1) // A's later removal beats B's earlier add
assert.ok(!M.e["f/p1/z"].del && !M.e["f/p1/x"].del) // union
assert.equal(M.progress["p1/m1"].pos, 90) // newest progress wins
assert.equal(M.e["c/theme"].v, "dark") // LWW per setting
assert.ok(M.e["s/s1"] && !M.e["s/s1"].del) // new source arrives
assert.equal(M.days["p1/2026-01-01"].sec, 5)

// applying to A: favorites newest first, source added, profile/theme updated, stamps stable (no echo)
const ap = applySnapshot(a, M)
assert.deepEqual(ap.slice.data.p1.favs.sort(), ["x", "z"])
assert.equal(ap.slice.sources.length, 1)
assert.equal(ap.slice.settings.theme, "dark")
assert.equal(ap.slice.data.p1.progress.m1.pos, 90)
assert.equal(stamp(ap.stamps, flatten(ap.slice), 99), ap.stamps) // nothing to restamp

// deletions propagate: B removes the source later, A (still has it) loses it
const b2 = { ...b, sources: [] }
const eB2 = stamp(eB, flatten(b2), 40)
const M2 = merge(M, buildSnapshot(b2, eB2, {}, 50))
assert.equal(M2.e["s/s1"].del, 1)
assert.equal(applySnapshot(ap.slice, M2).slice.sources.length, 0)
// a re-created entity after deletion wins again
const eB3 = stamp(eB2, flatten(b), 60)
assert.ok(!merge(M2, buildSnapshot(b, eB3, {}, 70)).e["s/s1"].del)

// deleting a profile drops its data on apply
const M3 = merge(M, { ...emptySnap(), e: { "p/p1": { t: 999, del: 1 } } })
const ap3 = applySnapshot(a, M3)
assert.equal(ap3.slice.profiles.length, 0)
assert.deepEqual(ap3.slice.data, {})
assert.equal(A0.e["p/p1"].t, 0)
console.log("sync ok")

// display settings: synced once set, never written while undefined
{
  const a = slice({ settings: { theme: "system", trackHistory: true } })
  assert.equal(flatten(a)["c/cardSize"], undefined)
  const b = slice({ settings: { theme: "system", trackHistory: true, cardSize: "large", colorTheme: "forest", homeOrder: ["live", "cont"] } })
  const f = flatten(b)
  assert.equal(f["c/cardSize"].v, "large")
  assert.equal(f["c/colorTheme"].v, "forest")
  assert.equal(flatten(a)["c/colorTheme"], undefined)
  assert.deepEqual(f["c/homeOrder"].v, ["live", "cont"])
}
console.log("display settings ok")

// manual TMDB matches: one entity per title, so different titles matched on two devices both survive; a reset propagates
{
  const K1 = "movie:el fil el azraq:2014", K2 = "series:la totfe2 el shams:"
  const a = slice({ settings: { theme: "system", trackHistory: true, metaMatch: { [K1]: { id: "279690", title: "الفيل الأزرق", poster: "p.jpg" } } } })
  const b = slice({ settings: { theme: "system", trackHistory: true, metaMatch: { [K2]: "120911" } } })
  const eA = stamp({}, flatten(a), 10), eB = stamp({}, flatten(b), 20)
  const M = merge(buildSnapshot(a, eA, {}, 30), buildSnapshot(b, eB, {}, 30))
  const ap = applySnapshot(a, M)
  assert.deepEqual(ap.slice.settings.metaMatch, { [K1]: { id: "279690", title: "الفيل الأزرق", poster: "p.jpg" }, [K2]: "120911" }) // display info rides along; old id-only entries still load
  assert.equal(stamp(ap.stamps, flatten(ap.slice), 99), ap.stamps) // no echo
  // B resets K2 later: A loses it, and with no matches left the setting is undefined
  const b2 = slice({ settings: { theme: "system", trackHistory: true } })
  const M2 = merge(merge(M, buildSnapshot(b2, stamp(eB, flatten(b2), 40), {}, 50)), { ...emptySnap(), e: { [`m/${encodeURIComponent(K1)}`]: { t: 60, del: 1 } } })
  assert.equal(applySnapshot(ap.slice, M2).slice.settings.metaMatch, undefined)
}
console.log("meta match ok")

// manual channel logos: one entity per channel key, both devices' picks survive
{
  const a = slice({ settings: { theme: "system", trackHistory: true, logoMatch: { beinsports1: "a.png" } } })
  const b = slice({ settings: { theme: "system", trackHistory: true, logoMatch: { mbc1: "b.png" } } })
  const M = merge(buildSnapshot(a, stamp({}, flatten(a), 10), {}, 30), buildSnapshot(b, stamp({}, flatten(b), 20), {}, 30))
  const ap = applySnapshot(a, M)
  assert.deepEqual(ap.slice.settings.logoMatch, { beinsports1: "a.png", mbc1: "b.png" })
  assert.equal(stamp(ap.stamps, flatten(ap.slice), 99), ap.stamps) // no echo
  // "Remove all" on A later: B loses both (tombstones), and the setting is undefined again
  const a2 = slice({ settings: { theme: "system", trackHistory: true } })
  const M2 = merge(M, buildSnapshot(a2, stamp(ap.stamps, flatten(a2), 40), {}, 50))
  assert.equal(applySnapshot(b, M2).slice.settings.logoMatch, undefined)
  // an import on B (many at once) reaches A
  const b3 = slice({ settings: { theme: "system", trackHistory: true, logoMatch: { x: "https://x", y: "https://y" }, metaMatch: { "movie:z:": "3" } } })
  const M3 = merge(M2, buildSnapshot(b3, stamp({}, flatten(b3), 60), {}, 70))
  const a3 = applySnapshot(a2, M3).slice.settings
  assert.deepEqual([a3.logoMatch, a3.metaMatch], [{ x: "https://x", y: "https://y" }, { "movie:z:": "3" }])
}
console.log("logo match ok")

// sports follows: one entity per team, per profile; unfollow tombstones; two devices union
{
  const liv = { provider: "espn", teamId: "soccer/eng.1/364", name: "Liverpool", badge: "https://cdn/liv.png", league: "Premier League" }
  const mun = { provider: "espn", teamId: "soccer/eng.1/360", name: "Manchester United", league: "Premier League" }
  const a = slice({ data: { p1: { favs: [], recents: [], progress: {}, follows: [liv] } } })
  const b = slice({ data: { p1: { favs: [], recents: [], progress: {}, follows: [mun] } } })
  const M = merge(buildSnapshot(a, stamp({}, flatten(a), 10), {}, 30), buildSnapshot(b, stamp({}, flatten(b), 20), {}, 30))
  const ap = applySnapshot(a, M)
  assert.deepEqual(ap.slice.data.p1.follows, [mun, liv]) // sorted by provider:teamId; both devices' picks kept
  assert.equal(stamp(ap.stamps, flatten(ap.slice), 99), ap.stamps) // no echo
  // B unfollows United later: A loses it too
  const b2 = slice({ data: { p1: { favs: [], recents: [], progress: {}, follows: [] } } })
  const M2 = merge(M, buildSnapshot(b2, stamp(stamp({}, flatten(b), 20), flatten(b2), 40), {}, 50))
  assert.deepEqual(applySnapshot(ap.slice, M2).slice.data.p1.follows, [liv])
}
console.log("follows ok")

// clock skew: within 2 min = fine, beyond = minutes off (either direction)
assert.equal(clockSkewMin(1e9, 1e9 + 119000), 0)
assert.equal(clockSkewMin(1e9, 1e9 + 600000), 10)
assert.equal(clockSkewMin(1e9 + 3600000, 1e9), 60)
console.log("clock skew ok")

// merge summary: counts what the other device changed, by kind
{
  const a = slice({ sources: [{ id: "s1" }] as never })
  const b = slice({ sources: [{ id: "s1" }, { id: "s2" }] as never, data: { p1: { favs: ["x"], recents: [], progress: {} } } })
  const la = buildSnapshot(a, stamp({}, flatten(a), 10), {}, 20)
  const lb = buildSnapshot(b, stamp({}, flatten(b), 30), {}, 40)
  const n = mergeSummary(la, merge(la, lb))
  assert.equal(n.sources, 2) // s2 is new and s1 was re-stamped later by b; ponytail: counts any entity that differs
  assert.equal(mergeSummary(la, la).sources + mergeSummary(la, la).other, 0)
}
console.log("merge summary ok")

// per-device server pick: changing only `server` on a multi-address source is not a change, and a merge keeps this device's pick
{
  const jf = (server: string) => ({ id: "j1", type: "jellyfin", server, localServer: "http://192.168.1.5:8096", remoteServer: "https://jf.example.com", serverId: "abc", userId: "u" })
  const a = slice({ sources: [jf("http://192.168.1.5:8096")] as never })
  const st = stamp({}, flatten(a), 10)
  const a2 = slice({ sources: [jf("https://jf.example.com")] as never })
  assert.equal(stamp(st, flatten(a2), 99), st) // no restamp, so no ping-pong between devices
  const remote = buildSnapshot(a, st, {}, 20)
  const b = slice({ sources: [jf("https://jf.example.com")] as never })
  const ap = applySnapshot(b, remote)
  assert.equal((ap.slice.sources[0] as { server?: string }).server, "https://jf.example.com") // B keeps its own active address
  assert.equal(stamp(ap.stamps, flatten(ap.slice), 99), ap.stamps)
  // a plain source (single address) still syncs its server
  const x1 = slice({ sources: [{ id: "x", type: "xtream", server: "http://a" }] as never }), x2 = slice({ sources: [{ id: "x", type: "xtream", server: "http://b" }] as never })
  assert.notEqual(flatten(x1)["s/x"].h, flatten(x2)["s/x"].h)
}
// duplicate sources: same account on the same server under two ids
assert.equal(dupSources([{ id: "1", type: "xtream", server: "http://h/", user: "u" }, { id: "2", type: "xtream", server: "http://H", user: "u" }, { id: "3", type: "xtream", server: "http://h", user: "v" }] as never), 1)
console.log("server pick + dupes ok")
