// node scripts/avail.check.ts
import assert from "node:assert/strict"
import { buildIndex, findMatch } from "../src/lib/meta/avail-pure.ts"
import { matchKeyOf } from "../src/lib/meta/title.ts"
import type { Item } from "../src/lib/types.ts"

const it = (id: string, kind: Item["kind"], name: string, extra: Partial<Item> = {}): Item => ({ id, kind, name, group: "g", ...extra })
const id = (x?: Item) => x?.id

const dune21 = it("a|movie|1", "movie", "Dune (2021)", { tmdb: "438631", imdb: "tt1160419" })
const dune84 = it("a|movie|2", "movie", "Dune (1984)")
const alt = it("b|movie|9", "movie", "Heat", { year: "1995", tmdb: "949" })
const heat = it("a|movie|3", "movie", "AR - Heat [4K]", { alts: [alt] })
const show = it("a|series|1", "series", "Dune", { tmdb: "438631" }) // same number as the movie: ids are per kind
const renamed = it("a|movie|4", "movie", "Renamed Title", { srcName: "Panel Name (2019)" })
const ix = buildIndex([dune21, dune84, heat, show, renamed, it("a|live|1", "live", "Heat TV")], { [matchKeyOf("movie", "Panel Name (2019)")]: { id: "777" } })

// ids first, kind-scoped
assert.equal(id(findMatch(ix, { kind: "movie", tmdb: "438631", title: "Whatever" })), "a|movie|1")
assert.equal(id(findMatch(ix, { kind: "series", tmdb: "438631", title: "Whatever" })), "a|series|1", "movie and tv ids overlap")
assert.equal(id(findMatch(ix, { kind: "movie", imdb: "tt1160419", title: "x" })), "a|movie|1")
assert.equal(findMatch(ix, { kind: "movie", tmdb: "0", title: "Nothing" }), undefined, "junk id, no title hit")
// an alt's id resolves to its primary
assert.equal(id(findMatch(ix, { kind: "movie", tmdb: "949", title: "x" })), "a|movie|3")
// title + year guard
assert.equal(id(findMatch(ix, { kind: "movie", title: "Dune", year: "1984" })), "a|movie|2", "same title, other year")
assert.equal(id(findMatch(ix, { kind: "movie", title: "Dune", year: "2021" })), "a|movie|1")
assert.equal(findMatch(ix, { kind: "movie", title: "Dune", year: "2030" }), undefined, "a remake years away is another film")
assert.equal(id(findMatch(ix, { kind: "movie", title: "Dune", year: "2022" })), "a|movie|1", "+-1 year (release dates differ by region)")
assert.equal(id(findMatch(ix, { kind: "movie", title: "Heat", year: "1995" })), "a|movie|3", "title runs through cleanTitle; alt year used")
assert.equal(id(findMatch(ix, { kind: "movie", title: "Dune" })), "a|movie|1", "no ref year: first copy")
assert.equal(id(findMatch(ix, { kind: "movie", title: "Zzz", alt: "Heat", year: "1995" })), "a|movie|3", "alt (original) title")
// a known, different id blocks a title hit
assert.equal(findMatch(ix, { kind: "movie", tmdb: "1", title: "Dune", year: "2021" }), undefined, "Dune 2021 holds tmdb 438631, not 1")
// manual match supplies an id; srcName and renamed name both index
assert.equal(id(findMatch(ix, { kind: "movie", tmdb: "777", title: "x" })), "a|movie|4")
assert.equal(id(findMatch(ix, { kind: "movie", title: "Renamed Title", year: "2019" })), "a|movie|4")
assert.equal(id(findMatch(ix, { kind: "movie", title: "Panel Name", year: "2019" })), "a|movie|4")
// live is never matched
assert.equal(findMatch(ix, { kind: "movie", title: "Heat TV" }), undefined)
console.log("avail.check ok")
