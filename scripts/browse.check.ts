// node scripts/browse.check.ts - the extra browse filters
import assert from "node:assert/strict"
import { byAdded, byName, byRelease, day, decadesOf, foldedName, matchMore, sortList, watchOf } from "../src/lib/browse-pure.ts"
import { fold } from "../src/lib/i18n/pure.ts"
import type { Item } from "../src/lib/types.ts"

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
// cached name fold / sorter, and sort-then-filter = filter-then-sort (the browse hooks rely on it)
{
  const l = ["Éclair", "zeta", "Alpha 10", "alpha 2", "Beta", "الأخبار", "beta"].map((n, k) => ({ ...m(n, String(2000 + (k % 3)), String(k % 4)), added: k % 2 ? k : undefined }) as Item)
  for (const i of l) assert.equal(foldedName(i), fold(i.name))
  assert.equal(byName("en"), byName("en"), "one sorter per language")
  assert.equal(sortList(l, "default", "en"), l)
  for (const sort of ["az", "rating", "year", "added"] as const) for (const q of ["", "a", "eta", "e"]) {
    const f = fold(q)
    assert.deepEqual(sortList(l, sort, "en").filter((i) => foldedName(i).includes(f)).map((i) => i.id), sortList(l.filter((i) => foldedName(i).includes(f)), sort, "en").map((i) => i.id), `${sort} ${q}`)
  }
  assert.deepEqual(sortList(l, "az", "en").slice(0, 3).map((i) => i.name), ["Alpha 2", "Alpha 10", "Beta"].map((n) => l.find((i) => i.name.toLowerCase() === n.toLowerCase())!.name))
}
console.log("browse ok")
