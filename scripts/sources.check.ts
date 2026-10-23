// node scripts/sources.check.ts
import assert from "node:assert/strict"
import { applyMatches, buildMatchIndex, catsOf, dedupeKey, groupKey, liveKey, mergeSources, mergeSourcesAsync, versionTags, onlySource, srcOfId, type GroupOpts, type Merged } from "../src/lib/merge-pure.ts"
import { cleanTitle, matchKeyOf } from "../src/lib/meta/title.ts"
import type { Kind } from "../src/lib/types.ts"
import { byAdded } from "../src/lib/browse-pure.ts"
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
// IPTV (self): one title under several categories becomes one tile listed in every category; another year stays apart
const ds = mergeSources([{ id: "a", self: true, items: [{ ...it("a", "movie", "1", "X (2020)", "EN"), added: 5 }, { ...it("a", "movie", "2", "X", "4K"), added: 9 }, it("a", "movie", "3", "X (1999)", "EN")] }])
assert.equal(ds.byKind.movie.length, 2)
assert.deepEqual(catsOf(ds.byKind.movie[0]), ["EN", "4K"])
assert.deepEqual(ds.groups.movie, ["EN", "4K"])
assert.equal(ds.primaryOf.get("a|movie|2")!.id, "a|movie|1")
assert.equal([...ds.byKind.movie].sort(byAdded)[0].id, "a|movie|1", "newest copy's added date counts")
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
  // lookups also fill title, year, backdrop, plot, genres and rating (the source's name moves to srcName); a manual match keeps its own title
  const fm = applyMatches(base, undefined, { [key]: { title: "El Fil El Azraq", year: "2014", poster: "https://meta/p.jpg", backdrop: "https://meta/b.jpg", plot: "P", genres: ["Drama"], rating: "7.4" } }).byId.get("a|movie|1")!
  assert.ok(fm.name === "El Fil El Azraq" && fm.srcName === "AR - El Fil El Azraq (2014) 4K" && fm.year === "2014" && fm.backdrop === "https://meta/b.jpg" && fm.plot === "P" && fm.genres![0] === "Drama" && fm.rating === "7.4")
  assert.equal(applyMatches(base, { [key]: { id: "1", title: "X" } }, { [key]: { title: "Other" } }).byId.get("a|movie|1")!.name, "X")
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

// the indexed candidate lookup = the old linear scan (kept here as the reference): same items, alts, cats, byId, primaryOf
function oldMerge(parts: { id: string; items: Item[]; self?: boolean }[], opts: GroupOpts = {}): Merged {
  const yearOfItem = (i: Item) => i.year?.match(/\d{4}/)?.[0] ?? cleanTitle(i.name).year
  const media = opts.media !== false
  const items: Item[] = [], byId = new Map<string, Item>(), primaryOf = new Map<string, Item>()
  const names: Record<Kind, Map<string, string>> = { live: new Map(), movie: new Map(), series: new Map() }
  const seen = new Map<string, number[]>(), years = new Map<number, Set<string>>()
  const yearsAt = (n: number) => { let y = years.get(n); if (!y) { y = new Set(); const v = yearOfItem(items[n]); if (v) y.add(v); years.set(n, y) } return y }
  for (const part of parts) for (const raw of part.items) {
    const gk = groupKey(raw.group)
    const g = names[raw.kind].get(gk) ?? (names[raw.kind].set(gk, raw.group), raw.group)
    const it = g === raw.group ? raw : { ...raw, group: g, origGroup: raw.group }
    byId.set(it.id, it)
    const k = raw.kind === "live" ? (opts.live ? liveKey(raw) : null) : media ? dedupeKey(raw) : null
    const candidates = k === null ? undefined : seen.get(k)
    const at = candidates?.find((index) => {
      if (it.kind === "live") return true
      if (srcOfId(items[index].id) === part.id && !part.self) return false
      const known = yearsAt(index), year = yearOfItem(raw)
      return !year || !known.size || known.has(year)
    })
    const p = at === undefined ? undefined : items[at]
    if (p) {
      const np = p.alts ? p : { ...p, alts: [] as Item[] }
      np.alts!.push(it)
      if (it.kind !== "live") { const y = yearOfItem(raw); if (y) yearsAt(at!).add(y) }
      if (it.kind !== "live" && srcOfId(np.id) === part.id && !catsOf(np).includes(it.group)) np.cats = [...catsOf(np), it.group]
      if (np !== p) { items[at!] = np; byId.set(np.id, np) }
      primaryOf.set(it.id, np)
      continue
    }
    if (k !== null) { if (candidates) candidates.push(items.length); else seen.set(k, [items.length]) }
    items.push(it)
  }
  const byKind: Record<Kind, Item[]> = { live: [], movie: [], series: [] }
  const gs: Record<Kind, Set<string>> = { live: new Set(), movie: new Set(), series: new Set() }
  for (const i of items) { byKind[i.kind].push(i); for (const c of catsOf(i)) gs[i.kind].add(c) }
  return { items, byId, primaryOf, byKind, groups: { live: [...gs.live], movie: [...gs.movie], series: [...gs.series] } }
}
const shape = (m: Merged) => ({
  items: m.items.map((i) => [i.id, i.group, (i.alts ?? []).map((a) => a.id), i.cats ?? null]),
  byId: [...m.byId].map(([k, v]) => [k, v.id, (v.alts ?? []).map((a) => a.id), v.cats ?? null]),
  primaryOf: [...m.primaryOf].map(([k, v]) => [k, v.id]),
  byKind: (["live", "movie", "series"] as const).map((k) => m.byKind[k].map((i) => i.id)),
  groups: m.groups,
})
{
  let seed = 1
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n)
  for (let round = 0; round < 300; round++) {
    const srcs = ["a", "b", "c"].slice(0, 1 + rnd(3))
    const parts = srcs.map((id) => ({ id, self: !!rnd(2), items: Array.from({ length: 5 + rnd(40) }, (_, n): Item => {
      const kind = (["movie", "series", "live", "movie"] as const)[rnd(4)]
      const y = ["", "", " (2001)", " (2002)", " (2003)"][rnd(5)]
      const name = kind === "live" ? ["BBC One HD", "BBC One FHD", "UK| BBC One", "CNN", "CNN (Backup)"][rnd(5)] : ["Dune", "The Dune", "Heat", "AR - Heat"][rnd(4)] + y
      return { id: `${id}|${kind}|${n}`, kind, name, group: ["Action", "action", "Drama", "4K"][rnd(4)], year: rnd(4) ? undefined : ["2001", "2002", "2003"][rnd(3)] }
    }) }))
    const opts = { media: !!rnd(6), live: !!rnd(2) }
    assert.deepEqual(shape(mergeSources(parts, opts)), shape(oldMerge(parts, opts)), `random merge ${round}`)
    if (round % 30 === 0) assert.deepEqual(shape(await mergeSourcesAsync(parts, opts, 7)), shape(oldMerge(parts, opts)), `sliced merge ${round}`)
  }
  // abandoned slices: an aborted merge rejects instead of finishing
  const abort = { aborted: true }
  await assert.rejects(mergeSourcesAsync([{ id: "a", items: A }], {}, 1, abort), { name: "AbortError" })
}
// re-apply only changed keys: same result as the full apply, untouched kinds keep their arrays, nothing changed = same object
{
  const parts = [
    { id: "a", self: true, items: [it("a", "movie", "1", "Dune (2021)", "g"), it("a", "movie", "2", "Heat (1995)", "g"), it("a", "series", "3", "Lost (2004)", "s"), it("a", "live", "4", "CNN", "n")] },
    { id: "b", items: [it("b", "movie", "9", "AR - Dune (2021) 4K", "x")] },
  ]
  const base = mergeSources(parts)
  const pristine = base.items.slice()
  const ix = buildMatchIndex(base)
  const kd = matchKeyOf("movie", "Dune (2021)"), kh = matchKeyOf("movie", "Heat (1995)")
  assert.deepEqual(ix.get(kd), [0])
  assert.deepEqual(ix.get(matchKeyOf("movie", "AR - Dune (2021) 4K")), [0], "an alt's key points at its primary")
  const f1 = { [kd]: { poster: "https://p/d.jpg" } }
  const full1 = applyMatches(base, undefined, f1)
  const part1 = applyMatches(base, undefined, f1, { changed: [kd], index: ix })
  assert.deepEqual(shape(part1), shape(full1))
  assert.equal(part1.byId.get("b|movie|9")!.logo, "https://p/d.jpg")
  assert.equal(part1.byKind.series, base.byKind.series, "no changed series: same array")
  assert.equal(part1.byKind.live, base.byKind.live)
  assert.equal(base.items[0], pristine[0], "not owned: base untouched")
  const f2 = { ...f1, [kh]: { title: "Heat!" } }
  const part2 = applyMatches(part1, undefined, f2, { changed: [kh], index: ix, from: pristine })
  assert.deepEqual(part2.items.map((i) => [i.name, i.logo]), applyMatches(base, undefined, f2).items.map((i) => [i.name, i.logo]))
  assert.equal(applyMatches(part2, undefined, f2, { changed: ["movie:nothing:"], index: ix, from: pristine }), part2, "nothing changed: same object")
  // a removed match restores the source's own item
  const part3 = applyMatches(part2, undefined, f1, { changed: [kh], index: ix, from: pristine })
  assert.equal(part3.byId.get("a|movie|2"), pristine[1])
  // owned: written in place, same result as the copying apply
  const own = mergeSources(parts)
  const r = applyMatches(own, undefined, f2, { owned: true })
  assert.equal(r.items, own.items)
  assert.deepEqual(shape(r), shape(applyMatches(base, undefined, f2)))
}
console.log("sources.check ok")
