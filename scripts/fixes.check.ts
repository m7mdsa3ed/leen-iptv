// node scripts/fixes.check.ts - Settings > Fix matches: what needs fixing, export / import of manual fixes
import assert from "node:assert/strict"
import { autoPick, exportFixes, failedKey, logoFixes, mergeFixes, metaFixes, newestMetaFixes, parseFixes } from "../src/lib/fixes-pure.ts"
import { buildLogoIndex, type LogoRow } from "../src/lib/logos-pure.ts"
import { matchKeyOf } from "../src/lib/meta/title.ts"
import type { Item } from "../src/lib/types.ts"

const ix = buildLogoIndex([["beIN Sports 1", "", "QA", "https://x/b1.png", 0, "beINSports1.qa"]] as LogoRow[])
const live = (name: string, logo?: string): Item => ({ id: "a|live|" + name, kind: "live", name, group: "g", logo })
const L = logoFixes([live("AR| beIN Sports 1 HD"), live("beIN Sports 1 FHD"), live("Jeem TV"), live("Jeem TV HD"), live("MBC 1", "own.png")], ix, undefined)
assert.deepEqual(L.map((x) => [x.key, x.from, x.copies]), [["beinsports1", "db", 2], ["jem", "none", 2]]) // one row per channel; own logos are fine
assert.equal(logoFixes([live("Jeem TV")], ix, { jem: "https://x/j.png" }).length, 0) // fixed by hand

const vod = (name: string, logo?: string, kind: "movie" | "series" = "movie"): Item => ({ id: "a|" + kind + "|" + name, kind, name, group: "g", logo })
assert.equal(failedKey("meta5:movie:the weight:2023:::tmdb:1"), "movie:the weight:2023")
assert.equal(failedKey("season:tmdb:1:2:"), undefined)
const failed = new Set([failedKey("meta5:movie:the weight:2023:::x")!])
const M = metaFixes([vod("AR - The Weight (2023) [4K]", "p.jpg"), vod("The Weight (2023)"), vod("No Art"), vod("Fine", "p.jpg"), vod("Fixed")], failed, { [matchKeyOf("movie", "Fixed")]: "5" })
assert.deepEqual(M.map((x) => [x.item.name, x.reason]), [["AR - The Weight (2023) [4K]", "failed"], ["No Art", "noPoster"]]) // same title once; matched ones are done
assert.deepEqual(newestMetaFixes([{ item: vod("Undated") }, { item: { ...vod("Old"), year: "1998" } }, { item: { ...vod("New"), year: "2023" } }, { item: vod("Newer (2024)") }]).map((x) => x.item.name), ["Newer (2024)", "New", "Old", "Undated"])

const U = metaFixes([vod("Seen", "p.jpg"), vod("Never", "p.jpg"), vod("No Art 2"), vod("Fixed 2", "p.jpg")], new Set(), { [matchKeyOf("movie", "Fixed 2")]: "5" }, new Set([matchKeyOf("movie", "Seen")]))
assert.deepEqual(U.map((x) => [x.item.name, x.reason]), [["Never", "unchecked"], ["No Art 2", "noPoster"]]) // looked-up, matched: fine; without `looked` nothing is unchecked
assert.equal(metaFixes([vod("Never", "p.jpg")], new Set(), undefined).length, 0)

const cand = (title: string, year?: string, alt?: string) => ({ title, year, alt, id: title + year })
assert.equal(autoPick("AR - The Weight (2023) [4K]", [cand("The Weight", "2023"), cand("The Weight", "1998")])?.year, "2023")
assert.equal(autoPick("The Weight", [cand("The Weight", "2023"), cand("The Weight", "1998")]), undefined) // no year, two exact titles: ask the user
assert.equal(autoPick("Weight", [cand("The Weight", "2023")]), undefined) // not the same title
assert.equal(autoPick("Dune (2021)", [cand("Dune", "1984"), cand("Dune", "2021")])?.year, "2021")
assert.equal(autoPick("Parasite", [cand("Gisaengchung", "2019", "Parasite")])?.year, "2019") // original title counts

// export -> import round trip; junk dropped (it syncs to every device)
const f = { logoMatch: { jem: "https://x/j.png" }, metaMatch: { "movie:the weight:2023": { id: "12", title: "The Weight", poster: "https://p/x.jpg" }, "series:x:": "7" } }
assert.deepEqual(parseFixes(exportFixes(f)), f)
assert.equal(parseFixes("not json"), null)
assert.equal(parseFixes(JSON.stringify({ type: "history" })), null)
const junk = parseFixes(JSON.stringify({ type: "matches", logoMatch: { a: "javascript:alert(1)", b: 5, c: "https://ok/c.png" }, metaMatch: { "movie:a:": "abc", "other:b:": "1", "movie:c:": { id: "9", poster: "javascript:x", title: 3 } } }))
assert.deepEqual(junk, { logoMatch: { c: "https://ok/c.png" }, metaMatch: { "movie:c:": { id: "9" } } })
assert.deepEqual(mergeFixes({ logoMatch: { a: "https://1", b: "https://2" } }, { logoMatch: { b: "https://3" }, metaMatch: {} }), { logoMatch: { a: "https://1", b: "https://3" }, metaMatch: {} })
console.log("fixes ok")
