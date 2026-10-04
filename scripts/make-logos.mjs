// Builds public/channel-logos.json from the iptv-org database (https://github.com/iptv-org/database, public domain),
// plus tv-logo/tv-logos (https://github.com/tv-logo/tv-logos) for channels iptv-org does not have.
// Row = [name, alt names joined by "|", country, logo url, closed ? 1 : 0, iptv-org id (= many panels' tvg-id)]. Rerun now and then: `node scripts/make-logos.mjs`.
import { writeFileSync } from "node:fs"
import { chanKey } from "../src/lib/logos-pure.ts"

const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json() }
const [channels, logos, tree] = await Promise.all([
  get("https://iptv-org.github.io/api/channels.json"),
  get("https://iptv-org.github.io/api/logos.json"),
  get("https://api.github.com/repos/tv-logo/tv-logos/git/trees/main?recursive=1"),
])

// best logo per channel: the channel's own (not a feed's), in use, widest
const score = (l) => (l.feed ? 0 : 4) + (l.in_use ? 2 : 0) + Math.min(l.width || 0, 1000) / 1000
const best = new Map()
for (const l of logos) { const b = best.get(l.channel); if (!b || score(l) > score(b)) best.set(l.channel, l) }

const rows = []
const have = new Set()
for (const c of channels) {
  const l = best.get(c.id)
  if (!l || c.is_nsfw) continue
  rows.push([c.name, (c.alt_names ?? []).join("|"), c.country, l.url, c.closed ? 1 : 0, c.id])
  for (const n of [c.name, ...(c.alt_names ?? [])]) have.add(chanKey(n).key)
}

// tv-logos: countries/<country>/<name>-<cc>.png, e.g. countries/lebanon/al-jadeed-lb.png; only names iptv-org lacks
let extra = 0
for (const { path } of tree.tree) {
  const m = /^countries\/[^/]+\/(([a-z0-9-]+?)-([a-z]{2,3}))\.(png|svg)$/.exec(path)
  if (!m) continue
  const name = m[2].replace(/-/g, " ")
  const k = chanKey(name).key
  if (!k || have.has(k)) continue
  have.add(k)
  rows.push([name, "", m[3] === "int" ? "INT" : m[3].toUpperCase(), `https://raw.githubusercontent.com/tv-logo/tv-logos/main/${path}`, 0, ""])
  extra++
}
writeFileSync(new URL("../public/channel-logos.json", import.meta.url), JSON.stringify(rows))
console.log(rows.length, "channels with logos,", extra, "from tv-logos")
