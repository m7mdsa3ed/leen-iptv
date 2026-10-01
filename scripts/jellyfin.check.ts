// node scripts/jellyfin.check.ts
import assert from "node:assert/strict"
import { authHeader, fromTicks, imageUrl, jfUrl, mapChannel, mapDetail, mapEpisode, mapItem, mapPrograms, normServer, toTicks } from "../src/lib/jellyfin-pure.ts"

assert.equal(normServer(" jf.lan:8096/ "), "http://jf.lan:8096")
assert.equal(normServer("https://jf.example.com//"), "https://jf.example.com")
assert.equal(jfUrl("http://h/", "/Users/1/Items", { a: "x y", b: undefined, c: "" }, "T"), "http://h/Users/1/Items?a=x%20y&api_key=T")
assert.equal(jfUrl("http://h", "/System/Info/Public"), "http://h/System/Info/Public")
assert.equal(authHeader("D"), 'MediaBrowser Client="Leen IPTV", Device="Web", DeviceId="D", Version="1.0"')
assert.ok(authHeader("D", "T").endsWith(', Token="T"'))
assert.equal(toTicks(61.5), 615000000)
assert.equal(fromTicks(615000000), 62)
assert.equal(fromTicks(0), undefined)
assert.equal(imageUrl("http://h", "abc", "Primary", 300, "t1"), "http://h/Items/abc/Images/Primary?maxWidth=300&quality=90&tag=t1")

const img = (id: string, type: string, w: number, tag?: string) => `IMG/${id}/${type}/${w}/${tag}`
const movie = mapItem(
  { Id: "42", Type: "Movie", Name: "Heat", ProductionYear: 1995, Overview: "s", CommunityRating: 8.25, ImageTags: { Primary: "p" }, BackdropImageTags: ["b"],
    UserData: { PlaybackPositionTicks: 610000000, Played: false }, RunTimeTicks: 72000000000, Genres: ["Crime"], Container: "mkv,webm" },
  { sourceId: "s1", group: "Movies", img },
)
assert.deepEqual(movie, { id: "s1|movie|42", kind: "movie", sid: "42", name: "Heat", group: "Movies", logo: "IMG/42/Primary/300/p", backdrop: "IMG/42/Backdrop/1280/b",
  plot: "s", rating: "8.3", year: "1995", genres: ["Crime"], resume: 61, dur: 7200, ext: "mkv" })
const show = mapItem({ Id: "7", Type: "Series", Name: "X" }, { sourceId: "s1", group: "TV", img })
assert.equal(show.kind, "series")
assert.equal(show.logo, undefined)
assert.deepEqual(show.genres, [])

const ep = mapEpisode({ Id: "e1", Name: "Pilot", ParentIndexNumber: 2, IndexNumber: 3, RunTimeTicks: 30000000000, UserData: { PlaybackPositionTicks: 100000000 } }, { ...show, logo: "L" }, "s1", img)
assert.deepEqual(ep, { id: "e1", season: 2, num: 3, title: "Pilot", dur: "50m", item: { id: "s1|ep|e1", kind: "movie", sid: "e1", name: "X S2E3", group: "X", logo: "L", plot: undefined, resume: 10, dur: 3000 } })
assert.equal(mapEpisode({ Id: "e0", ParentIndexNumber: 0, IndexNumber: 1 }, show, "s1", img).season, 0) // specials stay in season 0

const ch = mapChannel({ Id: "c1", Name: "BBC", ChannelNumber: "5", ImageTags: { Primary: "i" } }, "s1", img)
assert.deepEqual(ch, { id: "s1|live|c1", kind: "live", sid: "c1", name: "BBC", group: "Live TV", logo: "IMG/c1/Primary/300/i", epgId: "c1", num: 5 })
assert.equal(mapChannel({ Id: "c2", Name: "Y", ChannelNumber: "5a" }, "s1", img).num, undefined)

const g = mapPrograms([
  { ChannelId: "c1", Name: "B", StartDate: "2026-01-01T11:00:00Z", EndDate: "2026-01-01T12:00:00Z" },
  { ChannelId: "c1", Name: "A", EpisodeTitle: "Ep", Overview: "o", StartDate: "2026-01-01T10:00:00Z", EndDate: "2026-01-01T11:00:00Z" },
  { ChannelId: "c2", Name: "bad", StartDate: "nope", EndDate: "2026-01-01T11:00:00Z" },
])
assert.deepEqual([...g.keys()], ["c1"])
assert.deepEqual(g.get("c1"), [
  { s: Date.parse("2026-01-01T10:00:00Z"), e: Date.parse("2026-01-01T11:00:00Z"), t: "A: Ep", d: "o" },
  { s: Date.parse("2026-01-01T11:00:00Z"), e: Date.parse("2026-01-01T12:00:00Z"), t: "B", d: undefined },
])

const d = mapDetail({
  Id: "42", Overview: "p", ProductionYear: 1995, PremiereDate: "1995-12-15T00:00:00Z", RunTimeTicks: 72000000000, CommunityRating: 8.25, CriticRating: 88,
  Genres: ["Crime"], ProviderIds: { Tmdb: "949", Imdb: "tt0113277" }, ImageTags: { Primary: "p" },
  People: [{ Id: "a", Name: "Al", Role: "Hanna", Type: "Actor", PrimaryImageTag: "t" }, { Id: "m", Name: "M", Type: "Director" }, { Id: "w", Name: "W", Type: "Writer" }],
}, img)
assert.deepEqual(d.meta.ratings, [{ source: "Rating", value: "8.3" }, { source: "Rotten Tomatoes", value: "88%" }])
assert.deepEqual(d.meta.cast, [{ name: "Al", role: "Hanna", photo: "IMG/a/Primary/200/t" }])
assert.deepEqual(d.meta.directors, ["M"])
assert.deepEqual(d.meta.ids, { tmdb: "949", imdb: "tt0113277" })
assert.equal(d.meta.poster, "IMG/42/Primary/600/p")
assert.equal(d.info.duration, "2h 0m")
assert.equal(d.info.releasedate, "1995-12-15")
console.log("jellyfin ok")
