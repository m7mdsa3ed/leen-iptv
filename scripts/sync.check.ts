// node scripts/sync.check.ts
import assert from "node:assert/strict"
import { applySnapshot, buildSnapshot, emptySnap, flatten, merge, stable, stamp, type AppSlice, type Stamp } from "../src/lib/sync/merge.ts"

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
  const b = slice({ settings: { theme: "system", trackHistory: true, cardSize: "large", homeOrder: ["live", "cont"] } })
  const f = flatten(b)
  assert.equal(f["c/cardSize"].v, "large")
  assert.deepEqual(f["c/homeOrder"].v, ["live", "cont"])
}
console.log("display settings ok")
