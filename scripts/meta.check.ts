// node scripts/meta.check.ts
import assert from "node:assert/strict"
import { cleanTitle, norm, tmdbId } from "../src/lib/meta/title.ts"
import { enrichEpisodes, isGenericEpTitle } from "../src/lib/meta/episodes.ts"
import { mapDiscover } from "../src/lib/meta/plex-discover-pure.ts"
import { resolveKey, shareable, sharedKey, shareBody, validShared } from "../src/lib/meta/shared-pure.ts"

assert.deepEqual(cleanTitle("AR - The Weight (2023) 4K"), { title: "The Weight", year: "2023" })
assert.deepEqual(cleanTitle("|EN| Hellfire [FHD]"), { title: "Hellfire", year: undefined })
assert.deepEqual(cleanTitle("Coyote vs Acme"), { title: "Coyote vs Acme", year: undefined })
assert.equal(cleanTitle("Blade Runner 2049").title, "Blade Runner 2049") // bare numbers are part of the title
assert.equal(cleanTitle("Wonder Woman 1984 (2020)").year, "2020")
assert.equal(cleanTitle("Movie 12").title, "Movie 12")
assert.equal(norm("The Widower: 'Til Death Do Us Part"), norm("the widower til death do us part (2024)"))
for (const bad of [undefined, null, "", "0", "N/A", "tt0111161", "12a"]) assert.equal(tmdbId(bad), undefined)
assert.equal(tmdbId(" 550 "), "550")
assert.equal(tmdbId(550), "550")
// generic panel episode names are replaced, real ones kept
for (const g of ["Episode 3", "E03", "S01E03", "s1 e3", "الحلقة 3", "حلقة ٣", "Breaking Bad S01E03", "Breaking Bad - Episode 3", "مسلسل الاختيار الحلقة 5", ""]) assert.ok(isGenericEpTitle(g, g.includes("Breaking") ? "Breaking Bad" : "الاختيار"), g)
for (const r of ["The Reunion", "Pilot", "عودة الغائب", "Ozymandias (S05E14)", "Episode 3: Revenge"]) assert.ok(!isGenericEpTitle(r, "Breaking Bad"), r)
{
  const item = (id: string, logo?: string, plot?: string) => ({ id, kind: "movie" as const, name: id, group: "", logo, plot })
  const eps = [
    { id: "1", season: 1, num: 1, title: "Episode 1", item: item("a", "SERIES") },
    { id: "2", season: 1, num: 2, title: "The Real Name", item: item("b", "own.jpg", "panel plot") },
    { id: "3", season: 2, num: 1, title: "Episode 1", item: item("c") },
  ]
  const metas = [
    { num: 1, title: "Pilot", plot: "tmdb plot", still: "still1.jpg", runtime: 2700, guests: [], directors: [], writers: [] },
    { num: 2, title: "TMDB Name", plot: "tmdb plot 2", still: "still2.jpg", guests: [], directors: [], writers: [] },
  ]
  const out = enrichEpisodes(eps, 1, metas, "Show", "SERIES")
  assert.deepEqual([out[0].title, out[0].item.logo, out[0].item.plot, out[0].dur], ["Pilot", "still1.jpg", "tmdb plot", 2700]) // all gaps filled
  assert.deepEqual([out[1].title, out[1].item.logo, out[1].item.plot], ["The Real Name", "own.jpg", "panel plot"]) // panel data kept
  assert.equal(out[2], eps[2]) // other season untouched
  assert.equal(enrichEpisodes(eps, 1, null, "Show"), eps)
  assert.equal(enrichEpisodes(eps, 3, metas, "Show"), eps) // nothing to change = same array (no re-render)
  // manual match: provider wins over the panel's real data too, but a generic provider title never replaces a real one
  const forced = enrichEpisodes(eps, 1, [...metas.slice(0, 1), { ...metas[1], title: "الحلقة 2" }], "Show", "SERIES", true)
  assert.deepEqual([forced[0].title, forced[0].item.logo, forced[0].item.plot], ["Pilot", "still1.jpg", "tmdb plot"])
  assert.deepEqual([forced[1].title, forced[1].item.logo, forced[1].item.plot], ["The Real Name", "still2.jpg", "tmdb plot 2"])
  assert.equal(enrichEpisodes(eps, 1, metas, "Show", "SERIES", true)[1].title, "TMDB Name")
  assert.equal(forced[2], eps[2])
}
// shared (Supabase) cache: what is shared, the key shape the SQL CHECK expects, and distrust of rows read back
for (const p of ["/movie/550", "/tv/1399", "/tv/1399/season/2"]) assert.ok(shareable(p), p)
for (const p of ["/search/movie", "/movie/abc", "/person/1", "/movie/550/credits", "/genre/movie/list", "/tv/1/season/"]) assert.ok(!shareable(p), p)
{
  const key = sharedKey("ar", "/tv/1399", { language: "ar", include_video_language: "ar,en,null", append_to_response: "credits,images" })
  assert.equal(key, "tmdb:v1:ar:/tv/1399?append_to_response=credits,images&include_video_language=ar,en,null") // language is in the key once, params sorted
  assert.match(key, /^tmdb:v[0-9]+:[A-Za-z-]{2,10}:\/(movie|tv)\/[0-9]+(\/season\/[0-9]+)?\?/) // same pattern as meta_cache.key in schema.sql
  assert.ok(validShared("/movie/550", { id: 550, title: "x" }))
  assert.ok(!validShared("/movie/550", { id: 551 })) // a row for another title
  assert.ok(!validShared("/movie/550", []) && !validShared("/movie/550", null) && !validShared("/movie/550", "x"))
  assert.ok(validShared("/tv/1/season/2", { episodes: [] }) && !validShared("/tv/1/season/2", { id: 1 }))
  const big = { id: 1, credits: { cast: Array.from({ length: 90 }, (_, i) => ({ id: i })), crew: [{ job: "Director" }, { job: "Gaffer" }] }, images: { backdrops: Array.from({ length: 200 }, () => ({})) } }
  assert.deepEqual(shareBody("/movie/1", big), big) // the full response is stored, nothing cut
  assert.equal(shareBody("/tv/1/season/1", { episodes: [1] }).episodes.length, 1)
  // title -> TMDB id: language-free key the SQL CHECK accepts, and only a plain id is believed
  const rk = resolveKey("movie", "the weight", "2023")
  assert.equal(rk, "tmdb:v1:any:/resolve/movie?title=the weight&year=2023")
  assert.ok(/^tmdb:v[0-9]+:[A-Za-z-]{2,10}:(\/(movie|tv)\/[0-9]+(\/season\/[0-9]+)?|\/resolve\/(movie|series))\?/.test(rk))
  assert.ok(validShared("/resolve/movie", { id: 550 }) && !validShared("/resolve/movie", { id: "abc" }) && !validShared("/resolve/movie", { id: 0 }) && !validShared("/resolve/movie", {}))
  assert.deepEqual(shareBody("/resolve/tv", { id: 5, junk: 1 }), { id: 5 })
}
// Plex Discover title (shape from metadata.provider.plex.tv)
{
  const m = mapDiscover({
    title: "Inception", year: 2010, summary: "A burglar...", duration: 8880000, thumb: "t.jpg", art: "a.jpg", contentRating: "gb/15",
    Genre: [{ tag: "Action" }], Director: [{ tag: "Christopher Nolan" }], Similar: [{ tag: "Push" }],
    Role: [{ tag: "Leonardo DiCaprio", role: "Dom Cobb", thumb: "l.jpg", id: "5d77" }],
    Rating: [{ image: "imdb://image.rating", type: "audience", value: 8.8 }, { image: "rottentomatoes://image.rating.ripe", type: "critic", value: 8.6 }, { image: "rottentomatoes://image.rating.upright", type: "audience", value: 9.1 }, { image: "themoviedb://image.rating", type: "audience", value: 8.374 }],
    Image: [{ type: "clearLogo", url: "logo.png" }],
    Guid: [{ id: "imdb://tt1375666" }, { id: "tmdb://27205" }, { id: "tvdb://113" }],
  })
  assert.equal(m.runtime, 8880)
  assert.equal(m.cert, "15")
  assert.equal(m.logo, "logo.png")
  assert.deepEqual(m.ids, { tmdb: "27205", imdb: "tt1375666" })
  assert.deepEqual(m.ratings!.map((r) => `${r.source} ${r.value}`), ["IMDb 8.8", "Rotten Tomatoes 86%", "TMDB 8.4"]) // RT audience skipped
  assert.deepEqual(m.cast, [{ name: "Leonardo DiCaprio", role: "Dom Cobb", photo: "l.jpg" }]) // Plex person id dropped on purpose
  assert.equal(mapDiscover({}).runtime, undefined)
}
console.log("meta ok")

// Detail facts: TMDB extras, per-source stream info
import { jfStream, plexStream, streamInfo, tmdbExtras } from "../src/lib/meta/facts-pure.ts"
{
  const x = tmdbExtras({ name: "Dark", original_name: "Dark", tagline: "t", status: "Ended", original_language: "de", spoken_languages: [{ iso_639_1: "de" }, { iso_639_1: "en" }, { iso_639_1: "xx" }], origin_country: ["DE"], networks: [{ name: "Netflix" }], created_by: [{ id: 1, name: "Baran" }], credits: { crew: [{ id: 1, name: "Baran", job: "Writer" }, { id: 2, name: "Ben", job: "Gaffer" }] }, next_episode_to_air: { air_date: "2026-10-12", season_number: 2, episode_number: 4 } }, true, "I")
  assert.equal(x.original, undefined) // same as the title
  assert.deepEqual(x.languages, ["de", "en"])
  assert.deepEqual(x.crew, [{ id: "1", name: "Baran", role: "Creator, Writer", photo: undefined }]) // same person merged, unknown jobs dropped
  assert.deepEqual(x.next, { air: "2026-10-12", s: 2, e: 4 })
  assert.equal(tmdbExtras({ title: "A", original_title: "B", production_countries: [{ iso_3166_1: "US" }] }, false, "I").original, "B")
  assert.deepEqual(streamInfo({ video: [], audio: [], added: "1700000000", container: "mkv" }), { res: undefined, video: undefined, audio: undefined, ch: undefined, box: "MKV", added: 1700000000 }) // [] = never probed
  const v = streamInfo({ video: { codec_name: "hevc", width: 1920, height: 800 }, audio: { codec_name: "eac3", channels: 6 } })
  assert.deepEqual([v.res, v.video, v.audio, v.ch], ["1080p", "HEVC", "E-AC3", "5.1"]) // scope film at 1920x800 is still 1080p
  assert.equal(plexStream({ addedAt: 5, Media: [{ width: 3840, height: 2160, videoCodec: "h264", Part: [{ size: 9, Stream: [{ streamType: 2, languageTag: "en" }, { streamType: 2, languageTag: "en" }] }] }] }).langs?.length, 1)
  assert.equal(jfStream({ DateCreated: "1970-01-01T00:00:10Z", MediaSources: [{ Container: "mkv", Size: 5, MediaStreams: [{ Type: "Video", Codec: "av1", Width: 1280, Height: 720 }, { Type: "Audio", Codec: "aac", Channels: 2, Language: "eng" }] }] }).res, "720p")
}
