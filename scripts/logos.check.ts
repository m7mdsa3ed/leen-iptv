// node scripts/logos.check.ts — channel name cleaning + matching against public/channel-logos.json
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { addLogoRows, applyLogos, logoFor, tileName, buildLogoIndex, chanKey, emptyLogoIndex, findLogo, findRow, sealLogoIndex, searchLogos, type LogoRow } from "../src/lib/logos-pure.ts"
import type { Item } from "../src/lib/types.ts"

const kh = (n: string) => { const { key, hint } = chanKey(n); return { key, hint } }
assert.deepEqual(kh("AR| BEIN SPORTS 1 HD"), { key: "beinsports1", hint: "ARAB" })
assert.deepEqual(kh("|AR| MBC 1 ᴴᴰ"), { key: "mbc1", hint: "ARAB" })
assert.deepEqual(kh("[UK] Sky Sports Main Event FHD (Backup)"), { key: "skysportsmainevent", hint: "UK" }) // iptv-org's code for the UK
assert.deepEqual(kh("VIP|EG| Rotana Cinema 1080p"), { key: "rotanacinema", hint: "EG" })
assert.deepEqual(kh("101 - beIN Sports 1"), kh("beIN Sports 1")) // channel number prefix
assert.equal(chanKey("Alkass One").key, chanKey("Al Kass 1").key) // number words, spacing, doubled letters
assert.equal(chanKey("Al Masriyah").key, chanKey("AL MASRIYA").key) // final h
assert.equal(chanKey("Rotana Aflam Plus").key, chanKey("Rotana Aflam+").key)
assert.equal(chanKey("Fox News Channel").key, chanKey("FOX NEWS").key) // generic words
assert.equal(chanKey("TV 2").key, "tv2") // ...kept when only a number would remain
assert.equal(chanKey("Türkiye").key, chanKey("Turkiye").key)
assert.equal(chanKey("قناة ١").key, chanKey("قناة 1").key) // Arabic-Indic digits
assert.equal(chanKey("beIN Sport 2 HEVC").key, "beinsports2")
assert.equal(chanKey("OSN - Movies").key, "osnmovies") // a dash is not a prefix separator
assert.equal(chanKey("أم بي سي مصر").key, chanKey("ام بي سي مصر").key)

const ix = buildLogoIndex(JSON.parse(readFileSync(new URL("../public/channel-logos.json", import.meta.url), "utf8")) as LogoRow[])
for (const n of ["AR| beIN Sports 1 HD", "beIN SPORTS 2 FHD", "AR: MBC 2", "OSN Movies Action", "Rotana Cinema Egypt", "Al Jazeera", "BBC One HD"])
  assert.ok(findLogo(ix, n), `no logo for ${n}`)
assert.equal(findLogo(ix, "zz no such channel zz"), undefined)
const row = (n: string, g?: string, id?: string) => { const r = findRow(ix, n, g, id); return r && `${r[0]} [${r[2]}]` }
assert.equal(row("UK| CHANNEL 4"), "Channel 4 [UK]") // the hint picks the UK one, not Thailand's alt name
assert.equal(row("US| FOX NEWS"), "Fox News Channel [US]") // own name beats another channel's alt name
assert.equal(row("AR| SPACETOON"), "Spacetoon Arabic [AE]") // longer name in an Arab country beats Turkey's exact alt name
assert.equal(row("AR| beIN MOVIES 1 HD"), "beIN Movies 1 Premiere [QA]") // database name is longer
assert.equal(row("AR| MAJID KIDS"), "Majid [AE]") // provider name is longer
assert.equal(row("whatever", undefined, "beINSports2.qa@HD"), "beIN Sports 2 [QA]") // EPG id = iptv-org id
// the app builds the index in slices: same result
const rows = JSON.parse(readFileSync(new URL("../public/channel-logos.json", import.meta.url), "utf8")) as LogoRow[]
const ix2 = emptyLogoIndex()
for (let i = 0; i < rows.length; i += 2000) addLogoRows(ix2, rows.slice(i, i + 2000))
assert.deepEqual(sealLogoIndex(ix2).keys, ix.keys)
assert.ok(searchLogos(ix, "bein").length > 5)
// extra provider words ("beIN Sports 1 Premium HD") still surface the base channel in the picker
assert.ok(searchLogos(ix, "beIN Sports 1 Premium").some((r) => chanKey(r[0]).key === "beinsports1"))

const items: Item[] = [
  { id: "a|live|1", kind: "live", name: "AR| beIN Sports 1 HD", group: "AR | Sports" },
  { id: "a|live|2", kind: "live", name: "MBC 1", group: "x", logo: "own.png" },
  { id: "a|movie|3", kind: "movie", name: "beIN Sports 1", group: "x" },
]
const out = applyLogos(items, ix, { mbc1: "picked.png" })
assert.ok(out[0].logo?.startsWith("http")) // filled from the index
assert.equal(out[1].logo, "picked.png") // manual match beats the source's logo
assert.equal(out[2], items[2]) // movies untouched
const same = items.slice(1, 2)
assert.equal(applyLogos(same, null, undefined), same) // nothing to change = same array

// order: manual > source > index; the next one rides along as logoAlt (dead provider links)
const ch: Item = { id: "a|live|9", kind: "live", name: "AR| beIN Sports 1 HD", group: "x", epgId: "b1" }
assert.deepEqual(logoFor(ch, ix, undefined), { logo: findLogo(ix, ch.name), alt: undefined, from: "db" })
assert.equal(logoFor({ ...ch, logo: "own.png" }, ix, undefined).from, "source")
assert.equal(logoFor(ch, ix, { beinsports1: "mine.png" }).from, "manual")
assert.equal(logoFor({ ...ch, name: "zz nothing zz", epgId: undefined }, ix, undefined).from, "none")
assert.equal(applyLogos([{ ...ch, logo: "own.png" }], ix, undefined)[0].logoAlt, findLogo(ix, ch.name))

// no-logo tile text
assert.deepEqual(tileName("AR| beIN SPORTS 1 HD"), { title: "beIN SPORTS", num: "1", brand: "bein" })
assert.equal(tileName("101 - beIN Sports 2").brand, tileName("AR| BEIN SPORTS NEWS").brand) // one colour per brand
assert.equal(tileName("قناة الحياة ١").num, "١")
assert.deepEqual(tileName("BBC"), { title: "BBC", num: undefined, brand: chanKey("BBC").key })
console.log("logos ok")
