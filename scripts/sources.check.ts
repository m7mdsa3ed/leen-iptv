// node scripts/sources.check.ts
import assert from "node:assert/strict"
import { dedupeKey, groupKey, mergeSources, onlySource, srcOfId } from "../src/lib/merge-pure.ts"
import type { Item } from "../src/lib/types.ts"

const it = (src: string, kind: Item["kind"], raw: string, name: string, group: string, year?: string): Item => ({ id: `${src}|${kind}|${raw}`, kind, name, group, year })

assert.equal(srcOfId("a|movie|12"), "a")
assert.equal(groupKey("Action & Adventure"), groupKey("action  adventure"))
assert.notEqual(groupKey("|AR| Action"), groupKey("|EN| Action"))
assert.equal(dedupeKey(it("a", "movie", "1", "AR - The Weight (2023) [4K]", "x")), dedupeKey(it("b", "movie", "9", "The Weight", "y", "2023")))
assert.equal(dedupeKey(it("a", "movie", "1", "The Weight", "x")), null, "no year -> never merged")
assert.equal(dedupeKey(it("a", "live", "1", "CNN (2023)", "x")), null, "live never merged")

const A = [it("a", "movie", "1", "The Weight (2023)", "Action"), it("a", "live", "c1", "CNN", "News"), it("a", "movie", "2", "Only A (2020)", "Drama")]
const B = [it("b", "movie", "7", "The Weight", "action", "2023"), it("b", "live", "c1", "CNN", "NEWS"), it("b", "series", "s", "Show (2019)", "Drama"), it("b", "movie", "8", "The Weight", "Other")]
const m = mergeSources([{ id: "a", items: A }, { id: "b", items: B }])
const w = m.byId.get("a|movie|1")!
assert.deepEqual(w.alts?.map((x) => x.id), ["b|movie|7"], "A wins, B kept as alt")
assert.equal(m.items.filter((x) => x.kind === "movie").length, 3, "dup collapsed; yearless 'The Weight' (b|8) stays")
assert.equal(m.items.filter((x) => x.kind === "live").length, 2, "live never merged")
assert.ok(m.byId.has("b|movie|7") && m.byId.has("b|movie|8"), "byId has every item")
assert.equal(m.primaryOf.get("b|movie|7"), m.byId.get("a|movie|1"))
assert.equal(m.byId.get("a|movie|1"), m.items.find((x) => x.id === "a|movie|1"), "byId holds the primary with alts")
assert.equal(A[0].alts, undefined, "source items are never mutated")
assert.deepEqual(m.groups.live, ["News"], "same-named categories merge, first display name")
assert.deepEqual(m.groups.movie, ["Action", "Drama", "Other"].filter((g) => m.groups.movie.includes(g)))
assert.equal(m.byId.get("b|movie|7")!.group, "Action")
assert.equal(m.byId.get("b|movie|7")!.origGroup, "action")
assert.equal(m.byId.get("b|live|c1")!.group, "News")

// priority: reversed order flips the primary
const r = mergeSources([{ id: "b", items: B }, { id: "a", items: A }])
assert.equal(r.byId.get("b|movie|7")!.alts?.[0].id, "a|movie|1")
// same-source duplicates are not merged
const d = mergeSources([{ id: "a", items: [it("a", "movie", "1", "X (2020)", "g"), it("a", "movie", "2", "X (2020)", "g")] }])
assert.equal(d.items.length, 2)
// filter view
assert.ok(onlySource(m.byKind.movie, "b").some((x) => x.id === "b|movie|7"), "alt shows under its own source filter")
assert.ok(!onlySource(m.byKind.movie, "b").some((x) => x.id === "a|movie|2"))
console.log("sources.check ok")
