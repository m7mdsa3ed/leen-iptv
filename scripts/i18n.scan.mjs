// node scripts/i18n.scan.mjs [dir-or-file ...] : heuristic list of likely UNTRANSLATED user-visible literals in src/**/*.tsx
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : p.endsWith(".tsx") ? [p] : [])
const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["src"]
const has = (s) => /[A-Za-z]{2,}/.test(s) && !/^(https?:|[#./@])/.test(s.trim())
const ATTR = /\b(aria-label|title|placeholder|alt|label|description|hint)\s*=\s*"([^"]*)"/g
const TEXT = />\s*([^<>{}=;()\n]*[A-Za-z]{2,}[^<>{}=;()\n]*?)\s*(?=<|$)/g // JSX text between tags / at line end
const ERR = /(?:new Error|toast\w*|alert)\(\s*["`]([^"`]*)["`]/g
let n = 0
for (const f of roots.flatMap(walk)) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (/^\s*(import|\/\/|\*|\/\*)/.test(line) || line.includes("t(\"")) return
    const hits = []
    for (const m of line.matchAll(ATTR)) if (has(m[2])) hits.push(`${m[1]}="${m[2]}"`)
    for (const m of line.matchAll(ERR)) if (has(m[1])) hits.push(`error "${m[1]}"`)
    if (/>/.test(line) && !/=>\s*$|^\s*[)}\]]/.test(line)) for (const m of line.matchAll(TEXT)) { const s = m[1].trim(); if (has(s) && !/^(return|const|let|import|export|type|class)\b/.test(s) && !/^[A-Za-z]+(\.[A-Za-z]+)+$/.test(s)) hits.push(`text "${s}"`) }
    for (const h of hits) { n++; console.log(`${f}:${i + 1}: ${h}`) }
  })
}
console.log(`${n} candidate(s)`)
