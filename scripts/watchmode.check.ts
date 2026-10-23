// node scripts/watchmode.check.ts
import assert from "node:assert/strict"
import { mapWatchmodeDetails, mapWatchmodeSources, watchmodeRef, watchmodeSearchHit } from "../src/lib/meta/watchmode-pure.ts"

// sources: rent+buy collapse into one "purchase" per service (cheapest price), a missing / non-http web_url is dropped, order = sub, free, tve, purchase
const src = mapWatchmodeSources([
  { source_id: 7, name: "Apple TV", type: "buy", region: "EG", web_url: "https://tv.apple.com/x", price: 14.99 },
  { source_id: 7, name: "Apple TV", type: "rent", region: "EG", web_url: "https://tv.apple.com/x?r", price: 3.99 },
  { source_id: 203, name: "Netflix", type: "sub", region: "EG", web_url: "https://www.netflix.com/title/1", price: null },
  { source_id: 203, name: "netflix", type: "sub", region: "EG", web_url: "https://www.netflix.com/title/2" },
  { source_id: 9, name: "Ghost", type: "sub", region: "EG", web_url: null },
  { source_id: 10, name: "AppOnly", type: "free", region: "EG", web_url: "roku://launch/1" },
  { source_id: 11, name: "Tubi", type: "free", region: "EG", web_url: "http://tubitv.com/m/1" },
  { source_id: 12, name: "Cable", type: "tve", region: "EG", web_url: "https://cable.example/w" },
])
assert.deepEqual(src.map((a) => `${a.source}:${a.kind}`), ["Netflix:sub", "Tubi:free", "Cable:tve", "Apple TV:purchase"])
assert.equal(src[3].price, "3.99")
assert.equal(src[3].web, "https://tv.apple.com/x?r") // the link of the cheaper offer
assert.equal(src[0].web, "https://www.netflix.com/title/1") // first one wins when there is no price
assert.equal(src[0].price, undefined)
for (const bad of [null, undefined, {}, "x", 5, [null, 1, "a", {}], { error: "quota" }]) assert.deepEqual(mapWatchmodeSources(bad), [])

// details: a full answer
const d = mapWatchmodeDetails({
  id: 3173903, title: "Breaking Bad", plot_overview: "A chemistry teacher...", type: "tv_series", year: 2008, imdb_id: "tt0903747", tmdb_id: 1396,
  genre_names: ["Drama", "Crime"], user_rating: 9.2, critic_score: 85, us_rating: "TV-MA", poster: "https://img.example/p.jpg", backdrop: "https://img.example/b.jpg",
  original_language: "en", runtime_minutes: 45,
})
assert.equal(d.plot, "A chemistry teacher...")
assert.equal(d.year, "2008")
assert.deepEqual(d.genres, ["Drama", "Crime"])
assert.deepEqual(d.ratings, [{ source: "Watchmode", value: "9.2" }, { source: "Critics", value: "85%" }])
assert.equal(d.runtime, 2700) // seconds, like the TMDB adapter
assert.equal(d.cert, "TV-MA")
assert.deepEqual(d.ids, { tmdb: "1396", imdb: "tt0903747" })
assert.deepEqual(d.languages, ["en"])
assert.equal(d.poster, "https://img.example/p.jpg")
// details: N/A, null and junk fields never throw and leave no holes
const n = mapWatchmodeDetails({ title: "X", plot_overview: "N/A", year: null, genre_names: null, user_rating: null, critic_score: "N/A", us_rating: "N/A", poster: "N/A", backdrop: "", runtime_minutes: 0, imdb_id: "N/A", tmdb_id: null, original_language: "N/A" })
assert.deepEqual(n, { year: undefined, plot: undefined, genres: [], runtime: undefined, ratings: [], poster: undefined, backdrop: undefined, cert: undefined, languages: undefined, ids: { tmdb: undefined, imdb: undefined } })
for (const bad of [null, undefined, "x", 5, []]) assert.deepEqual(mapWatchmodeDetails(bad).ratings, [])

// search: right kind, closest year, wrong type rejected, exact name beats fuzzy
const res = { title_results: [
  { id: 1, name: "Dune", type: "movie", year: 1984, tmdb_type: "movie" },
  { id: 2, name: "Dune", type: "movie", year: 2021, tmdb_type: "movie" },
  { id: 3, name: "Dune", type: "tv_miniseries", year: 2000, tmdb_type: "tv" },
  { id: 4, name: "Dune: Part Two", type: "movie", year: 2024, tmdb_type: "movie" },
], people_results: [] }
assert.deepEqual(watchmodeSearchHit(res, "movie", "2021"), { id: "2" })
assert.deepEqual(watchmodeSearchHit(res, "movie", "1985"), { id: "1" })
assert.deepEqual(watchmodeSearchHit(res, "series", "2000"), { id: "3" })
assert.equal(watchmodeSearchHit(res, "movie", "2010"), null, "a farther year is a different title")
assert.deepEqual(watchmodeSearchHit(res, "movie", undefined, "Dune: Part Two"), { id: "4" })
assert.equal(watchmodeSearchHit({ title_results: [{ id: 3, name: "Dune", type: "tv_series", year: 2021 }] }, "movie", "2021"), null, "wrong type rejected")
assert.equal(watchmodeSearchHit({ title_results: [{ id: 3, name: "Dune", type: "movie", year: 2021 }] }, "series", "2021"), null)
for (const bad of [null, undefined, {}, [], "x", { title_results: "no" }]) assert.equal(watchmodeSearchHit(bad, "movie"), null)

// ids Watchmode accepts directly
assert.equal(watchmodeRef("movie", "tt0903747", "1396"), "tt0903747")
assert.equal(watchmodeRef("series", undefined, "1396"), "tv-1396")
assert.equal(watchmodeRef("movie", "N/A", "438631"), "movie-438631")
assert.equal(watchmodeRef("movie"), undefined)
console.log("watchmode.check ok")
