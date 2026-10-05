// node scripts/browse.check.ts - browse side index letters and the extra filters
import assert from "node:assert/strict"
import { alphaIndex, byAdded, byRelease, day, decadesOf, letterOf, matchMore, watchOf } from "../src/lib/browse-pure.ts"
import type { Item } from "../src/lib/types.ts"

// accents and alef forms fold into the base letter, other scripts/digits go to "#"
assert.equal(letterOf("Élan", "en"), "E")
assert.equal(letterOf("eagle", "en"), "E")
assert.equal(letterOf("أحمد", "ar"), "ا")
assert.equal(letterOf("إبراهيم", "ar"), "ا")
assert.equal(letterOf("1917", "en"), "#")
assert.equal(letterOf("الفيل", "en"), "#")

// the full alphabet, no duplicates, empty letters jump to the next one that has titles
const names = ["1917", "Alien", "Élan", "Eagle", "Zodiac"]
const ix = alphaIndex(names, "en")
assert.equal(ix.length, 27)
assert.equal(new Set(ix.map((x) => x.ch)).size, 27)
assert.deepEqual(ix.find((x) => x.ch === "E"), { ch: "E", index: 2, has: true })
assert.deepEqual(ix.find((x) => x.ch === "B"), { ch: "B", index: 2, has: false })
assert.deepEqual(ix.find((x) => x.ch === "Z"), { ch: "Z", index: 4, has: true })
assert.deepEqual(ix.at(-1), { ch: "#", index: 0, has: true })
assert.deepEqual(alphaIndex(["Alien", "Aliens"], "en"), [])

// filters
const m = (id: string, year?: string, rating?: string, kind: Item["kind"] = "movie") => ({ id, kind, name: id, group: "g", year, rating }) as Item
const prog = { a: { pos: 100, dur: 100 }, b: { pos: 10, dur: 100 }, s: { pos: 100, dur: 100 } }
assert.equal(watchOf(m("a"), prog.a), "done")
assert.equal(watchOf(m("b"), prog.b), "started")
assert.equal(watchOf(m("c"), undefined), "new")
assert.equal(watchOf(m("s", "", "", "series"), prog.s), "started")
assert.ok(matchMore(m("a", "1994", "8.1"), { watch: "done", decade: 1990, rating: 8 }, prog))
assert.ok(!matchMore(m("a", "2001", "8.1"), { decade: 1990 }, prog))
assert.ok(!matchMore(m("c", "1994"), { rating: 5 }, prog))
assert.deepEqual(decadesOf([m("a", "1994"), m("b", "2021"), m("c"), m("d", "1999")]), [2020, 1990])
// no year field (Xtream): the bracketed year in the name counts; no year at all sorts last
assert.deepEqual([m("Old (1999)"), m("x"), m("New [2024]"), m("Mid", "2010")].sort(byRelease).map((i) => i.name), ["New [2024]", "Mid", "Old (1999)", "x"])
assert.deepEqual(decadesOf([m("A (1985)")]), [1980])
// loose years: "Title 2023", "EN - Title - 2021 4K"; not a leading title number, not the future
assert.deepEqual([m("Dune 2021"), m("EN - Oppenheimer - 2023 4K"), m("Heat 1995")].sort(byRelease).map((i) => i.name), ["EN - Oppenheimer - 2023 4K", "Dune 2021", "Heat 1995"])
// release date beats year: dated titles in date order, a year-only title after the dated ones of its year
{
  const r = (name: string, released?: string, year?: string) => ({ ...m(name, year), released }) as Item
  assert.deepEqual([r("Jan", "2023-01-10"), r("Y", undefined, "2023"), r("Dec", "2023-12-01"), r("Old", "2019-06-01"), r("None")].sort(byRelease).map((i) => i.name), ["Dec", "Jan", "Y", "Old", "None"])
  assert.equal(day("2023-05-12T00:00:00.0000000Z"), "2023-05-12")
  assert.equal(day("2023"), undefined)
  const a = (name: string, added?: number) => ({ ...m(name), added }) as Item
  assert.deepEqual([a("old", 100), a("none"), a("new", 300)].sort(byAdded).map((i) => i.name), ["new", "old", "none"])
}
assert.deepEqual(decadesOf([m("2001: A Space Odyssey"), m("1917"), m("Blade Runner 2049")]), [], "no year in these")
console.log("browse ok")
