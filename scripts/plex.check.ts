// node scripts/plex.check.ts
import assert from "node:assert/strict"
import { buildUrl, mapDetail, mapMeta, photoUrl, sortConns } from "../src/lib/plex-pure.ts"

assert.equal(buildUrl("http://h:32400/", "/library/sections", { a: "x y" }, "T"), "http://h:32400/library/sections?a=x%20y&X-Plex-Token=T")
assert.equal(buildUrl("http://h", "/identity"), "http://h/identity")
assert.ok(photoUrl("http://h", "T", "/library/metadata/1/thumb/2", 300, 450).includes("url=%2Flibrary%2Fmetadata%2F1%2Fthumb%2F2"))

const order = sortConns([
  { uri: "https://relay", relay: true, protocol: "https" },
  { uri: "http://remote:1", local: false, protocol: "http" },
  { uri: "http://lan:1", local: true, protocol: "http" },
  { uri: "https://lan.plex.direct", local: true, protocol: "https" },
  { uri: "https://remote", local: false, protocol: "https" },
  { uri: "http://lan:1", local: true, protocol: "http" },
]).map((c) => c.uri)
assert.deepEqual(order, ["https://lan.plex.direct", "http://lan:1", "https://remote", "http://remote:1", "https://relay"])

const img = (p: string, w: number, h: number) => `IMG${w}x${h}${p}`
const movie = mapMeta(
  { ratingKey: "42", type: "movie", title: "Heat", year: 1995, summary: "s", rating: 8.25, thumb: "/t", art: "/a", viewOffset: 61000, duration: 7200000, Genre: [{ tag: "Crime" }], Media: [{ Part: [{ container: "mkv" }] }] },
  { sourceId: "s1", group: "Movies", img },
)
assert.deepEqual(movie, { id: "s1|movie|42", kind: "movie", sid: "42", name: "Heat", group: "Movies", logo: "IMG300x450/t", backdrop: "IMG1280x720/a", plot: "s", rating: "8.3", year: "1995", genres: ["Crime"], resume: 61, dur: 7200, ext: "mkv" })
assert.equal(mapMeta({ ratingKey: "7", type: "show", title: "X" }, { sourceId: "s1", group: "TV", img }).kind, "series")

const d = mapDetail({ summary: "p", year: 1995, duration: 7200000, Genre: [{ tag: "Crime" }], Director: [{ tag: "M" }], Role: [{ tag: "Al", role: "Hanna", thumb: "/p" }], Rating: [{ image: "imdb://image.rating", value: 8.3 }, { image: "rottentomatoes://image.rating.ripe", value: 8 }, { image: "other://", value: 1 }] }, img)
assert.deepEqual(d.meta.ratings.map((r) => r.source), ["IMDb", "Rotten Tomatoes"])
assert.equal(d.meta.cast[0].photo, "IMG200x200/p")
assert.equal(d.info.duration, "2h 0m")
console.log("plex ok")
