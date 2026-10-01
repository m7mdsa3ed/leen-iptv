// node scripts/i18n.check.ts : en/ar key parity, same {placeholders}, plural forms, core behaviour
import assert from "node:assert/strict"
import { en, ar } from "../src/lib/i18n/locales/index.ts"
import { duration, fmtNumber, resolveLang, translate, PLURAL_FORMS } from "../src/lib/i18n/pure.ts"

const ph = (v: unknown): string[] => [...new Set([...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
let bad = 0
const err = (m: string) => { bad++; console.error("FAIL", m) }
for (const k of Object.keys(en)) if (!(k in ar)) err(`missing in ar: ${k}`)
for (const k of Object.keys(ar)) if (!(k in en)) err(`missing in en: ${k}`)
for (const k of Object.keys(en)) {
  if (!(k in ar)) continue
  if (ph(en[k]).join() !== ph(ar[k]).join()) err(`placeholders differ: ${k}`)
  if (typeof en[k] !== typeof ar[k]) err(`string vs plural mismatch: ${k}`)
  for (const [name, d] of [["en", en], ["ar", ar]] as const) {
    const v = d[k]
    if (typeof v === "object") {
      if (typeof v.other !== "string") err(`${name} plural lacks other: ${k}`)
      for (const f of Object.keys(v)) if (!(PLURAL_FORMS as readonly string[]).includes(f)) err(`${name} unknown plural form ${f}: ${k}`)
      if (name === "ar") { const miss = PLURAL_FORMS.filter((f) => !(f in v)); if (miss.length) console.warn(`warn: ar plural ${k} lacks ${miss.join(",")}`) }
    }
  }
  if (!k.includes(".")) err(`key needs a namespace prefix: ${k}`)
}
const D = { en, ar }
assert.equal(resolveLang("auto", "ar-EG"), "ar"); assert.equal(resolveLang("auto", "en-US"), "en"); assert.equal(resolveLang("en", "ar"), "en")
assert.equal(translate(D, "en", "common.ok"), "OK")
assert.equal(translate(D, "ar", "no.such.key"), "no.such.key")
assert.equal(translate(D, "en", "common.items", { n: 1 }), "1 item")
assert.equal(translate(D, "en", "common.items", { n: 5 }), "5 items")
const items = (n: number) => translate(D, "ar", "common.items", { n })
assert.equal(items(0), "مفيش عناصر"); assert.equal(items(1), "عنصر واحد"); assert.equal(items(2), "عنصرين")
assert.equal(items(5), "٥ عناصر"); assert.equal(items(11), "١١ عنصر"); assert.equal(items(100), "١٠٠ عنصر")
assert.equal(fmtNumber("ar", 1234), "١٬٢٣٤")
assert.equal(duration("en", 3720), "1h 2m"); assert.equal(duration("ar", 3720), "١ س ٢ د"); assert.equal(duration("en", 45), "45s")
assert.equal(translate({ en: { "x.a": "Hi {name}" }, ar: {} }, "ar", "x.a", { name: "Sam" }), "Hi \u2068Sam\u2069") // falls back to en
if (bad) { console.error(`${bad} problem(s)`); process.exit(1) }
console.log(`i18n ok: ${Object.keys(en).length} keys`)
