// Times each stage of loading a big IPTV catalog (synthetic Xtream panel), so a change to the load path can be measured.
// node scripts/catalog.bench.ts [scale]   (scale 1 = 15k channels, 80k movies, 20k series). A TV runs these about 5-10x slower.
import { readFileSync } from "node:fs"
import { deserialize, serialize } from "node:v8"
import { applyMatches, buildMatchIndex, mergeSources, mergeSourcesAsync, type Found } from "../src/lib/merge-pure.ts"
import { applyLogos, buildLogoIndex, type LogoRow } from "../src/lib/logos-pure.ts"
import { matchKeyOf } from "../src/lib/meta/title.ts"
import { mapXtream } from "../src/lib/xtream-map.ts"
import type { Item, Kind } from "../src/lib/types.ts"

const scale = Number(process.argv[2] ?? 1)
const N = { live: 15000 * scale, movie: 80000 * scale, series: 20000 * scale }
const LANG = ["AR", "EN", "FR", "TR", "DE"], WORDS = ["The", "Last", "Night", "City", "Love", "War", "Dark", "Star", "King", "Road", "Ocean", "Secret", "Blue", "Fire", "Home"]
const CH = ["BBC One", "MBC 2", "beIN Sports 1", "Al Jazeera", "CNN", "Rotana Cinema", "OSN Movies", "Sky News", "ON E", "CBC"]
let seed = 7
const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n)
const VOCAB = Array.from({ length: 400 }, (_, i) => WORDS[i % WORDS.length] + (i >= WORDS.length ? String.fromCharCode(97 + (i % 26)) + (i % 7) : ""))
const made: string[] = []
// about 1 title in 5 is listed again (another category / language copy), the rest are unique
const title = () => made.length && !rnd(5) ? made[rnd(made.length)] : (made.push(Array.from({ length: 1 + rnd(4) }, () => VOCAB[rnd(VOCAB.length)]).join(" ")), made[made.length - 1])
const cats = (k: string) => Array.from({ length: 300 }, (_, i) => ({ category_id: String(i), category_name: `${LANG[i % 5]} | ${k} ${i}`, parent_id: 0 }))
const api = {
  live: Array.from({ length: N.live }, (_, i) => ({ num: i + 1, name: `${LANG[rnd(5)]}| ${CH[rnd(CH.length)]} ${["HD", "FHD", "4K", "SD", ""][rnd(5)]}`, stream_type: "live", stream_id: i, stream_icon: `http://logos.example.com/${i}.png`, epg_channel_id: i % 3 ? `ch${i}.tv` : null, added: "1700000000", is_adult: 0, category_id: String(rnd(300)), category_ids: [rnd(300)], custom_sid: "", tv_archive: 0, direct_source: "", tv_archive_duration: 0 })),
  movie: Array.from({ length: N.movie }, (_, i) => ({ num: i + 1, name: `${LANG[rnd(5)]} - ${title()} (${1980 + rnd(45)})${rnd(4) ? "" : " [4K]"}`, stream_type: "movie", stream_id: i, stream_icon: `https://image.tmdb.org/t/p/original/${i}abcdefghijklmnop.jpg`, rating: String(rnd(10)), rating_5based: rnd(5), added: String(1600000000 + i), is_adult: 0, category_id: String(rnd(300)), category_ids: [rnd(300)], container_extension: "mkv", custom_sid: "", direct_source: "", tmdb: String(1000 + i) })),
  series: Array.from({ length: N.series }, (_, i) => ({ num: i + 1, name: `${LANG[rnd(5)]} - ${title()} (${1990 + rnd(35)})`, series_id: i, cover: `https://image.tmdb.org/t/p/w600_and_h900_bestv2/${i}xyz.jpg`, plot: "A long plot ".repeat(20), cast: "Actor One, Actor Two, Actor Three", director: "Some Director", genre: "Drama / Crime", releaseDate: `${1990 + rnd(35)}-05-01`, last_modified: String(1600000000 + i), rating: "7.5", rating_5based: 3.8, backdrop_path: [`https://image.tmdb.org/t/p/w1280/${i}b.jpg`], youtube_trailer: "", episode_run_time: "45", category_id: String(rnd(300)), category_ids: [rnd(300)] })),
}

const t = (label: string, f: () => unknown) => { const t0 = performance.now(); const r = f(); console.log(`${label.padEnd(44)} ${(performance.now() - t0).toFixed(0).padStart(6)} ms`); return r }
type R = Record<string, unknown>
const map = (kind: Kind, list: R[], c: R[]): Item[] => mapXtream("s1", kind, c, list)

console.log(`channels ${N.live}, movies ${N.movie}, series ${N.series}\n-- network answer --`)
const text = { live: JSON.stringify(api.live), movie: JSON.stringify(api.movie), series: JSON.stringify(api.series) }
console.log(`answer size ${((text.live.length + text.movie.length + text.series.length) / 1e6).toFixed(1)} MB`)
const parsed = t("JSON.parse (3 answers)", () => ({ live: JSON.parse(text.live), movie: JSON.parse(text.movie), series: JSON.parse(text.series) })) as Record<Kind, R[]>
const items = t("map to items", () => (["live", "movie", "series"] as Kind[]).flatMap((k) => map(k, parsed[k], cats(k)))) as Item[]
const blob = t("cache write (structured clone)", () => serialize(items)) as Buffer
console.log(`cache size ${(blob.length / 1e6).toFixed(1)} MB`)
console.log("-- warm start --")
const cached = t("cache read (structured clone)", () => deserialize(blob)) as Item[]
const opts = { media: true, live: false }
const m = t("mergeSources (cold)", () => mergeSources([{ id: "s1", items: cached, self: true }], opts)) as ReturnType<typeof mergeSources>
const ix = t("logo index (parse + build)", () => buildLogoIndex(JSON.parse(readFileSync(new URL("../public/channel-logos.json", import.meta.url), "utf8")) as LogoRow[]))
t("applyLogos (cold)", () => applyLogos(m.byKind.live, ix as ReturnType<typeof buildLogoIndex>, {}))
const found: Record<string, Found> = {}
for (const i of m.byKind.movie.slice(0, 3000)) found[matchKeyOf(i.kind, i.name)] = { poster: "https://image.tmdb.org/t/p/w500/x.jpg", year: "2020" }
t("applyMatches (3000 found)", () => applyMatches(m, {}, found))
console.log("-- re-merge (a poster batch lands) --")
t("mergeSources (warm)", () => mergeSources([{ id: "s1", items: cached, self: true }], opts))
t("applyLogos (warm)", () => applyLogos(m.byKind.live, ix as ReturnType<typeof buildLogoIndex>, {}))
t("applyMatches (3000 found)", () => applyMatches(m, {}, found))
console.log("-- re-apply (what catalog.ts runs for posters / matches / logos now) --")
const base = mergeSources([{ id: "s1", items: cached, self: true }], opts)
const pristine = base.items.slice()
const ixm = t("buildMatchIndex (once per merge)", () => buildMatchIndex(base)) as Map<string, number[]>
const shown = t("applyMatches owned (first publish)", () => applyMatches(base, {}, found, { owned: true })) as ReturnType<typeof mergeSources>
const batch = Object.keys(found).slice(0, 15)
t("applyMatches 15 changed keys", () => applyMatches(shown, {}, found, { changed: batch, index: ixm, from: pristine }))
t("applyMatches all 3000 keys", () => applyMatches(shown, {}, found, { changed: Object.keys(found), index: ixm, from: pristine }))
const t0 = performance.now()
let slices = 0
const tick = setInterval(() => slices++, 0)
await mergeSourcesAsync([{ id: "s1", items: cached, self: true }], opts, 4000)
clearInterval(tick)
console.log(`${"mergeSourcesAsync (4000 / slice, wall)".padEnd(44)} ${(performance.now() - t0).toFixed(0).padStart(6)} ms  (${slices} timer turns between slices)`)
