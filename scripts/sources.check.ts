// node scripts/sources.check.ts
import assert from "node:assert/strict"
import { applyMatches, dedupeKey, groupKey, liveKey, mergeSources, versionTags, onlySource, srcOfId } from "../src/lib/merge-pure.ts"
import { matchKeyOf } from "../src/lib/meta/title.ts"
import type { Item } from "../src/lib/types.ts"

const it = (src: string, kind: Item["kind"], raw: string, name: string, group: string, year?: string): Item => ({ id: `${src}|${kind}|${raw}`, kind, name, group, year })

assert.equal(srcOfId("a|movie|12"), "a")
assert.equal(groupKey("Action & Adventure"), groupKey("action  adventure"))
assert.notEqual(groupKey("|AR| Action"), groupKey("|EN| Action"))
assert.equal(dedupeKey(it("a", "movie", "1", "AR - The Weight (2023) [4K]", "x")), dedupeKey(it("b", "movie", "9", "The Weight", "y", "2023")))
assert.equal(dedupeKey(it("a", "movie", "1", "The Weight", "x")), dedupeKey(it("b", "movie", "9", "The Weight", "y", "2023")), "yearless title shares its title key")
assert.equal(dedupeKey(it("a", "movie", "1", "The Weight CAM HEVC", "x")), dedupeKey(it("b", "movie", "9", "The Weight", "y")), "release tags are ignored")
assert.equal(dedupeKey(it("a", "live", "1", "CNN (2023)", "x")), null, "live never merged")

const A = [it("a", "movie", "1", "The Weight (2023)", "Action"), it("a", "live", "c1", "CNN", "News"), it("a", "movie", "2", "Only A (2020)", "Drama")]
const B = [it("b", "movie", "7", "The Weight", "action", "2023"), it("b", "live", "c1", "CNN", "NEWS"), it("b", "series", "s", "Show (2019)", "Drama"), it("b", "movie", "8", "The Weight", "Other")]
const m = mergeSources([{ id: "a", items: A }, { id: "b", items: B }])
const w = m.byId.get("a|movie|1")!
assert.deepEqual(w.alts?.map((x) => x.id), ["b|movie|7", "b|movie|8"], "A wins; matching source copies are retained as alts")
assert.equal(m.items.filter((x) => x.kind === "movie").length, 2, "matching known and yearless titles collapse")
assert.deepEqual(m.byId.get("a|movie|1")!.alts?.map((x) => x.id), ["b|movie|7", "b|movie|8"], "yearless copy joins matching known-year title")
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
// conflicting known years remain distinct across sources
const years = mergeSources([{ id: "a", items: [it("a", "movie", "1", "Remake (2020)", "g")] }, { id: "b", items: [it("b", "movie", "2", "Remake (2021)", "g")] }])
assert.equal(years.items.length, 2)
// filter view
assert.ok(onlySource(m.byKind.movie, ["b"]).some((x) => x.id === "b|movie|7"), "alt shows under its own source filter")
assert.ok(!onlySource(m.byKind.movie, ["b"]).some((x) => x.id === "a|movie|2"))
assert.equal(onlySource(m.byKind.movie, []).length, m.byKind.movie.length, "no sources picked = everything")
assert.equal(onlySource(m.byKind.movie, ["a", "b"]).length, m.byKind.movie.length, "several picked sources show every title")

// manual metadata matches: rename + re-poster the primary and its alts everywhere, keep the source name, leave the rest alone
{
  const parts = [
    { id: "a", items: [it("a", "movie", "1", "AR - El Fil El Azraq (2014) 4K", "Arabic", "2014"), it("a", "movie", "2", "Other (2014)", "Arabic"), it("a", "live", "3", "El Fil El Azraq (2014)", "News")] },
    { id: "b", items: [it("b", "movie", "9", "El Fil El Azraq (2014)", "Films", "2014")] },
  ]
  const base = mergeSources(parts)
  const key = matchKeyOf("movie", "El Fil El Azraq (2014)")
  assert.equal(key, matchKeyOf("movie", "AR - El Fil El Azraq (2014) 4K"))
  const m = applyMatches(base, { [key]: { id: "279690", title: "الفيل الأزرق", year: "2014", poster: "https://img/p.jpg", backdrop: "https://img/b.jpg" } })
  const p = m.byId.get("a|movie|1")!
  assert.deepEqual([p.name, p.srcName, p.logo, p.backdrop], ["الفيل الأزرق", "AR - El Fil El Azraq (2014) 4K", "https://img/p.jpg", "https://img/b.jpg"])
  assert.equal(m.byKind.movie.find((x) => x.id === "a|movie|1"), p) // lists see the renamed item
  assert.equal(m.byId.get("b|movie|9")!.name, "الفيل الأزرق") // the alt copy too
  assert.equal(m.primaryOf.get("b|movie|9"), p)
  assert.equal(m.byId.get("a|movie|2"), base.byId.get("a|movie|2")) // unmatched: same object
  assert.equal(m.byId.get("a|live|3")!.name, "El Fil El Azraq (2014)") // live is never matched
  assert.equal(applyMatches(m, { [key]: { id: "1", title: "Again" } }).byId.get("a|movie|1")!.srcName, "AR - El Fil El Azraq (2014) 4K") // re-applying keeps the source name
  assert.equal(applyMatches(base, { [key]: "279690" }), base) // id-only (older) match: no display info, nothing renamed
  assert.equal(applyMatches(base, {}), base)
  // Replace posters: only the poster changes (also for alts), a manual match poster still wins, live is never touched
  const pp = applyMatches(base, undefined, { [key]: "https://meta/p.jpg" })
  const pm = pp.byId.get("a|movie|1")!
  assert.equal(pm.logo, "https://meta/p.jpg")
  assert.ok(pm.mposter && pm.name === "AR - El Fil El Azraq (2014) 4K" && !pm.srcName)
  assert.equal(pp.byId.get("b|movie|9")!.logo, "https://meta/p.jpg")
  assert.equal(applyMatches(base, { [key]: { id: "1", title: "X", poster: "https://img/p.jpg" } }, { [key]: "https://meta/p.jpg" }).byId.get("a|movie|1")!.logo, "https://img/p.jpg")
  assert.equal(applyMatches(base, { [key]: { id: "1", title: "X" } }, { [key]: "https://meta/p.jpg" }).byId.get("a|movie|1")!.logo, "https://meta/p.jpg")
  assert.equal(applyMatches(base, undefined, {}), base)
}
// grouping options: media off = every copy listed; live variants (same source too) only when asked
{
  const media = [{ id: "a", items: [it("a", "movie", "1", "X (2020)", "g")] }, { id: "b", items: [it("b", "movie", "2", "X (2020)", "g")] }]
  assert.equal(mergeSources(media).byKind.movie.length, 1)
  assert.equal(mergeSources(media, { media: false }).byKind.movie.length, 2, "media grouping off")
  const live = [
    { id: "a", items: [it("a", "live", "1", "AR| beIN Sports 1 HD", "Sports"), it("a", "live", "2", "AR| beIN Sports 1 FHD (Backup)", "Sports FHD"), it("a", "live", "3", "AR| beIN Sports 2 HD", "Sports"), it("a", "live", "4", "UK| beIN Sports 1", "UK")] },
    { id: "b", items: [it("b", "live", "9", "AR: beIN Sports 1 4K", "x")] },
  ]
  assert.equal(liveKey(live[0].items[0]), liveKey(live[0].items[1]))
  assert.notEqual(liveKey(live[0].items[0]), liveKey(live[0].items[2]), "channel numbers stay apart")
  assert.notEqual(liveKey(live[0].items[0]), liveKey(live[0].items[3]), "country hints stay apart")
  assert.equal(mergeSources(live).byKind.live.length, 5, "live not grouped by default")
  const g = mergeSources(live, { live: true })
  assert.equal(g.byKind.live.length, 3)
  assert.deepEqual(g.byKind.live[0].alts!.map((x) => x.id), ["a|live|2", "b|live|9"])
  assert.equal(g.primaryOf.get("b|live|9")!.id, "a|live|1")
  assert.deepEqual(g.groups.live, ["Sports", "UK"], "a category whose channels all became variants is gone")
}
// version tags: what tells copies apart
assert.deepEqual(versionTags(it("a", "movie", "1", "|AR| Dune (2021) 4K HEVC Dubbed", "g")), ["AR", "4K", "HEVC", "Dubbed"])
assert.deepEqual(versionTags(it("a", "movie", "1", "EN - Dune 1080p HDR", "g")), ["EN", "1080p", "HDR"])
assert.deepEqual(versionTags(it("a", "movie", "1", "The Dune", "g")), [], "a title word is not a language prefix")
assert.deepEqual(versionTags({ ...it("a", "movie", "1", "Dune", "g"), codecs: "hevc,eac3" }), ["HEVC"], "Plex codecs")
console.log("sources.check ok")
