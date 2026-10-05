// node scripts/subs.check.ts: online subtitle helpers (SubDL / OpenSubtitles mapping, zip, encodings, formats)
import assert from "node:assert/strict"
import { deflateRawSync, crc32 } from "node:zlib"
import {
  assToVtt, cueHtml, decodeSub, episodeOf, gzipWrap, mapOs, mapSubdl, mergeHits, osSearchUrl, pickEntry, readZip, subdlSearchUrl, toWebVtt,
} from "../src/lib/subs-pure.ts"

assert.deepEqual(episodeOf("Severance S2E10"), { season: 2, episode: 10 })
assert.equal(episodeOf("Heat (1995)"), null)

const movie = { kind: "movie" as const, title: "Heat", year: "1995", tmdb: "949", imdb: "tt0113277" }
const ep = { kind: "series" as const, title: "Severance", tmdb: "95396", season: 2, episode: 3 }
assert.equal(subdlSearchUrl(movie, "ar", "K"), "https://api.subdl.com/api/v1/subtitles?api_key=K&type=movie&languages=AR&subs_per_page=30&tmdb_id=949")
assert.equal(subdlSearchUrl(ep, "en", "K"), "https://api.subdl.com/api/v1/subtitles?api_key=K&type=tv&languages=EN&subs_per_page=30&tmdb_id=95396&season_number=2&episode_number=3")
assert.equal(osSearchUrl(movie, "AR"), "https://api.opensubtitles.com/api/v1/subtitles?languages=ar&tmdb_id=949&type=movie") // sorted, lowercase
assert.equal(osSearchUrl(ep, "ar"), "https://api.opensubtitles.com/api/v1/subtitles?episode_number=3&languages=ar&parent_tmdb_id=95396&season_number=2&type=episode")
assert.equal(osSearchUrl({ kind: "movie", title: "The Thing", imdb: "tt0084787" }, "en"), "https://api.opensubtitles.com/api/v1/subtitles?imdb_id=84787&languages=en&type=movie")

const sd = mapSubdl({ status: true, subtitles: [
  { release_name: "Sev.S02E03.WEB", language: "AR", url: "/subtitle/1-2.zip", episode: 3 },
  { release_name: "Sev.S02E04.WEB", language: "AR", url: "/subtitle/3-4.zip", episode: 4 }, // other episode: dropped
  { release_name: "Sev.S02.Pack", language: "AR", url: "/subtitle/5-6.zip", full_season: true, hi: true },
] }, "ar", ep)
assert.deepEqual(sd.map((x) => x.name), ["Sev.S02E03.WEB", "Sev.S02.Pack"])
assert.equal(sd[1].hi, true)
assert.throws(() => mapSubdl({ status: false, error: "invalid api key" }, "ar", movie), /invalid api key/)
const os = mapOs({ data: [{ attributes: { language: "ar", release: "Heat.1995.BluRay", download_count: 900, files: [{ file_id: 77 }] } }, { attributes: { files: [] } }] })
assert.deepEqual(os, [{ provider: "opensubtitles", ref: "77", name: "Heat.1995.BluRay", lang: "ar", downloads: 900 }])
assert.deepEqual(mergeHits([os, [{ provider: "subdl", ref: "/x", name: "heat.1995.bluray", lang: "ar" }, { provider: "subdl", ref: "/y", name: "Other", lang: "ar" }]]).map((h) => h.ref), ["77", "/y"]) // same release once

// zip: a season pack with two episodes, deflated (method 8) + one stored (method 0)
function zip(files: { name: string; text: Uint8Array; store?: boolean }[]) {
  const loc: number[] = [], cen: number[] = []
  const le = (n: number, w: number) => Array.from({ length: w }, (_, i) => (n >>> (8 * i)) & 0xff)
  for (const f of files) {
    const data = f.store ? f.text : new Uint8Array(deflateRawSync(f.text))
    const name = [...new TextEncoder().encode(f.name)], crc = crc32(f.text), off = loc.length, m = f.store ? 0 : 8
    loc.push(...le(0x04034b50, 4), 20, 0, 0, 0, ...le(m, 2), 0, 0, 0, 0, ...le(crc, 4), ...le(data.length, 4), ...le(f.text.length, 4), ...le(name.length, 2), 0, 0, ...name, ...data)
    cen.push(...le(0x02014b50, 4), 20, 0, 20, 0, 0, 0, ...le(m, 2), 0, 0, 0, 0, ...le(crc, 4), ...le(data.length, 4), ...le(f.text.length, 4), ...le(name.length, 2), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le(off, 4), ...name)
  }
  return new Uint8Array([...loc, ...cen, ...le(0x06054b50, 4), 0, 0, 0, 0, ...le(files.length, 2), ...le(files.length, 2), ...le(cen.length, 4), ...le(loc.length, 4), 0, 0])
}
const srt = (n: number) => new TextEncoder().encode(`1\n00:00:0${n},000 --> 00:00:0${n + 1},500\nEpisode ${n}\n`)
const z = readZip(zip([{ name: "readme.txt", text: new TextEncoder().encode("hi"), store: true }, { name: "Sev.S02E02.srt", text: srt(2) }, { name: "Sev.S02E03.srt", text: srt(3) }]))
assert.equal(z.length, 3)
const e3 = pickEntry(z, { season: 2, episode: 3 })!
assert.equal(e3.name, "Sev.S02E03.srt")
const inflated = new Uint8Array(await new Response(new Blob([gzipWrap(e3)]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer())
assert.equal(new TextDecoder().decode(inflated), new TextDecoder().decode(srt(3)))
assert.equal(pickEntry(z)!.name, "Sev.S02E02.srt") // movie: first .srt
assert.deepEqual(readZip(new Uint8Array([1, 2, 3])), [])

// encodings: Windows-1256 Arabic, UTF-8, UTF-16 BOM
const win1256 = new Uint8Array([0xe3, 0xd1, 0xcd, 0xc8, 0xc7]) // "مرحبا"
assert.equal(decodeSub(win1256, "ar"), "مرحبا")
assert.equal(decodeSub(new TextEncoder().encode("مرحبا"), "ar"), "مرحبا")
assert.equal(decodeSub(new Uint8Array([0xff, 0xfe, 0x48, 0, 0x69, 0]), "en"), "Hi")

// formats
assert.equal(toWebVtt("a.srt", "1\r\n0:00:01.000 --> 0:00:02.000\r\nHi\r\n"), "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHi\n")
assert.equal(toWebVtt("a.vtt", "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n") // untouched
assert.equal(assToVtt("[Events]\nDialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,{\\i1}Hello{\\i0}\\Nthere, you\n"), "WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nHello\nthere, you\n")
assert.equal(toWebVtt("x.ass", "[Script Info]\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hi\n"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n")

// rendering: only i/b/u survive, everything else escaped
assert.equal(cueHtml("<i>Hi</i> <font color=red>you</font> <script>x</script> a<b & c &amp; d"), "<i>Hi</i> you x a&lt;b &amp; c &amp; d")
assert.equal(cueHtml("<v Bob>Yo</v> <c.yellow>hey</c>"), "Yo hey")
// languages
import { cleanCue, sameLang } from "../src/lib/subs-pure.ts"
assert.ok(sameLang("ar", "ara") && sameLang("en", "en-US") && sameLang("de", "ger") && sameLang("de", "deu") && sameLang("pt", "pt-BR"))
assert.ok(!sameLang("ar", "eng") && !sameLang("en", undefined) && !sameLang("es", "est"))

// hearing-impaired removal and the RTL punctuation fix
assert.equal(cleanCue("[door creaks]\nJOHN: Where are you?", { noHi: true }), "Where are you?")
assert.equal(cleanCue("(laughs) Fine. ♪ la la ♪", { noHi: true }), "Fine.")
assert.equal(cleanCue("- [gasps]\n- What?", { noHi: true }), "- What?")
assert.equal(cleanCue("[MUSIC PLAYING]", { noHi: true }), "")
assert.equal(cleanCue("Dr. Smith: OK", { noHi: true }), "Dr. Smith: OK") // not all caps: kept
assert.equal(cleanCue(".مرحبا\n؟إزيك", { rtlFix: true }), "مرحبا.\nإزيك؟")
assert.equal(cleanCue("<i>!يلا</i>", { rtlFix: true }), "<i>يلا</i>!")
assert.equal(cleanCue("...and then", { rtlFix: true }), "...and then") // English untouched
assert.equal(cleanCue("[x] Hi", {}), "[x] Hi") // both off: unchanged
console.log("subs ok")
