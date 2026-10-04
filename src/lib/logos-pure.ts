import type { Item } from "./types"

/** One channel of public/channel-logos.json (built by scripts/make-logos.mjs from iptv-org): name, alt names joined by "|", country, logo url, closed (1), iptv-org id. */
export type LogoRow = [string, string, string, string, 0 | 1, string]
export type LogoIndex = { rows: LogoRow[]; byKey: Map<string, LogoRow[]>; byId: Map<string, LogoRow>; keys: string[] }
type Key = { key: string; words: string[]; hint?: string }

const ARAB = new Set(["AE", "SA", "QA", "EG", "KW", "BH", "OM", "JO", "LB", "SY", "IQ", "PS", "YE", "MA", "DZ", "TN", "LY", "SD"])
// provider prefixes that are not iptv-org country codes (it uses UK, not GB)
const HINT: Record<string, string> = { GB: "UK", AR: "ARAB", ARAB: "ARAB", ARABIC: "ARAB", KSA: "SA", UAE: "AE", USA: "US" }
// quality / feed words providers append: "beIN Sports 1 FHD (Backup)" = "beIN Sports 1"
const NOISE = new Set(["hd", "fhd", "uhd", "sd", "hq", "lq", "4k", "8k", "hevc", "h264", "h265", "1080", "1080p", "1080i", "720", "720p", "576p", "480p", "2160p", "50fps", "60fps", "fps", "raw", "backup", "vip", "multi", "low", "hd+", "fhd+"])
// "Fox News" = "Fox News Channel", "Ten TV" = "Ten"; kept when nothing but a number would remain ("TV 2")
const GENERIC = new Set(["tv", "channel", "network", "قناه"]) // قناة = channel
// same word, other spellings: "Alkass One" = "Al Kass 1", "Aflam Plus" = "Aflam+", "A and E" = "A&E" (no "ten": "Ten TV" is not "10 TV")
const WORD: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", eleven: "11", twelve: "12", plus: "+", and: "&", sport: "sports" }
// leading "AR|", "|AR|", "AR:", "[AR]", "VIP|AR|" (not "AR - ": "OSN - Movies" would lose its brand); a channel number may end in "." or "-": "101 - beIN"
const PREFIX = /^\W*(?:([a-z0-9]{2,6})\s*[|:\])]|\d{1,4}\s*[.-])\s*/i

const memo = new Map<string, Key>()
/** Cleans a channel name into its matching key and pulls a country hint from a provider prefix ("AR| MBC 1 ᴴᴰ" -> {key "mbc1", hint "ARAB"}). Cached by name. */
export function chanKey(name: string): Key {
  let r = memo.get(name)
  if (!r) { if (memo.size > 200000) memo.clear(); memo.set(name, (r = cleanKey(name))) }
  return r
}

// transliterated Arabic is spelled many ways: doubled letters and a final "h" after a vowel do not count ("Masriyah" = "Masriya", "Alkass" = "Alkas")
const latin = (w: string) => (/^[a-z]+$/.test(w) ? w.replace(/(.)\1+/g, "$1").replace(/([aeiou])h$/, "$1") : w)
const join = (words: string[]) => words.join("")

function cleanKey(name: string): Key {
  const ascii = !/[^\x20-\x7e]/.test(name) // most names: skip the Unicode steps (index build runs ~40k names on a TV CPU)
  let s = ascii ? name : name.normalize("NFKC") // ᴴᴰ -> HD, full-width letters -> ASCII
  let hint: string | undefined
  for (let i = 0, m; i < 3 && (m = PREFIX.exec(s)); i++) {
    const p = m[1]?.toUpperCase()
    if (p && !hint && p !== "VIP" && !/\d/.test(p)) hint = HINT[p] ?? (p.length === 2 ? p : undefined)
    s = s.slice(m[0].length)
  }
  if (!ascii) s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // Türkiye = Turkiye
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)) // Arabic-Indic digits
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ً-ْٰٔٓـ]/g, "") // Arabic letter variants, hamza/tashkeel marks, tatweel
  s = s.toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ") // (Backup), [HD]
    .replace(/\bh\.?26([45])\b/g, " ") // H.265
  let words = s.split(ascii ? /[^a-z0-9+&]+/ : /[^\p{L}\p{N}+&]+/u).filter((w) => w && !NOISE.has(w)).map((w) => WORD[w] ?? w)
  if (words.some((w) => !GENERIC.has(w) && !/^\d+$/.test(w))) words = words.filter((w) => !GENERIC.has(w))
  words = words.map(latin) // after GENERIC: "channel" would be "chanel" by then
  return { key: join(words), words, hint }
}

/** Index rows by every name they go by, and by iptv-org id (many panels use it as tvg-id / epg_channel_id). */
export const buildLogoIndex = (rows: LogoRow[]): LogoIndex => sealLogoIndex(addLogoRows(emptyLogoIndex(), rows))
export const emptyLogoIndex = (): LogoIndex => ({ rows: [], byKey: new Map(), byId: new Map(), keys: [] })
/** Adds rows to an index (the app adds them in slices so a TV stays responsive); call sealLogoIndex once at the end. */
export function addLogoRows(ix: LogoIndex, rows: LogoRow[]): LogoIndex {
  for (const r of rows) {
    ix.rows.push(r)
    if (r[5]) ix.byId.set(r[5].toLowerCase(), r)
    for (const n of [r[0], ...(r[1] ? r[1].split("|") : [])]) {
      const k = cleanKey(n).key // not chanKey: its cache is for provider names, which are looked up on every re-merge
      if (!k) continue
      const l = ix.byKey.get(k)
      if (!l) ix.byKey.set(k, [r])
      else if (!l.includes(r)) l.push(r)
    }
  }
  return ix
}
export const sealLogoIndex = (ix: LogoIndex): LogoIndex => ((ix.keys = [...ix.byKey.keys()].sort()), ix)

/** Keys that start with `k` (the database's name is longer: "beIN Movies 1" -> "beIN Movies 1 Premiere"), shortest first. */
function extensions(ix: LogoIndex, k: string): string[] {
  let lo = 0, hi = ix.keys.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ix.keys[mid] < k) lo = mid + 1; else hi = mid }
  const out: string[] = []
  for (let i = lo; i < ix.keys.length && ix.keys[i].startsWith(k) && out.length < 50; i++) if (ix.keys[i] !== k) out.push(ix.keys[i])
  return out.sort((a, b) => a.length - b.length)
}

/** Best row for a key list (in preference order): the hint's country, then an Arab one for "AR|", then one still on air, then its own name (not an alt name) matching, then the earlier key. */
function pick(ix: LogoIndex, keys: string[], hint?: string): LogoRow | undefined {
  let best: LogoRow | undefined, bestRank = -1
  keys.forEach((k, n) => {
    for (const r of ix.byKey.get(k) ?? []) {
      const rank = (hint && r[2] === hint ? 400 : 0) + (hint === "ARAB" && ARAB.has(r[2]) ? 200 : 0) + (r[4] ? 0 : 100) + (cleanKey(r[0]).key === k ? 50 : 0) - Math.min(n, 49)
      if (rank > bestRank) { best = r; bestRank = rank }
    }
  })
  return best
}

/**
 * Channel for a name (and its EPG id when the source has one). In order: the EPG id as an iptv-org id, the exact cleaned name,
 * a longer database name that starts with it, then the name with trailing words dropped ("Majid Kids" -> "Majid").
 */
export function findRow(ix: LogoIndex, name: string, groupName?: string, epgId?: string): LogoRow | undefined {
  const id = epgId?.toLowerCase().replace(/@.*/, "") // "beINSports1.qa@HD" = feed of beINSports1.qa
  if (id && ix.byId.has(id)) return ix.byId.get(id)
  const { key, words, hint: h1 } = chanKey(name)
  if (!key) return undefined
  const hint = h1 ?? (groupName ? chanKey(groupName).hint : undefined) ?? (id?.match(/\.([a-z]{2})$/)?.[1].toUpperCase())
  // exact name first, but a longer name in the hinted country beats it ("AR| Spacetoon" -> "Spacetoon Arabic", not Turkey's "Spacetoon")
  const r = pick(ix, key.length >= 4 ? [key, ...extensions(ix, key)] : [key], hint)
  if (r) return r
  // ponytail: brand fallback, may show a sibling's logo ("Saudi Quran" -> "Saudi TV"); Match logo fixes those
  for (let n = words.length - 1; n >= 1; n--) {
    const k = join(words.slice(0, n))
    if (k.length >= 4 && !/^\d+$/.test(k) && ix.byKey.has(k)) return pick(ix, [k], hint)
  }
  return undefined
}

// re-merges ask again for the same channels: answers are kept per index (~50 bytes per channel)
const found = new WeakMap<LogoIndex, Map<string, string | undefined>>()
export function findLogo(ix: LogoIndex, name: string, groupName?: string, epgId?: string): string | undefined {
  let m = found.get(ix)
  if (!m) found.set(ix, (m = new Map()))
  const k = `${name}\u0000${groupName ?? ""}\u0000${epgId ?? ""}`
  if (m.has(k)) return m.get(k)
  const v = findRow(ix, name, groupName, epgId)?.[3]
  m.set(k, v)
  return v
}

/** Up to `max` rows whose names match the query (for the Match logo picker); exact key matches first, then names that contain (or are contained in) it - so "beIN Sports 1 Premium HD" still surfaces "beIN Sports 1". */
export function searchLogos(ix: LogoIndex, q: string, max = 40): LogoRow[] {
  const k = chanKey(q).key
  if (!k) return []
  const out = [...(ix.byKey.get(k) ?? [])]
  for (const [key, l] of ix.byKey) {
    if (out.length >= max) break
    if (key !== k && Math.min(key.length, k.length) >= 3 && (key.includes(k) || k.includes(key)))
      for (const r of l) if (!out.includes(r)) out.push(r)
  }
  return out.slice(0, max)
}

/** Key of a manual logo match (Settings `logoMatch`): every copy of a channel ("beIN Sports 1 HD", "AR| BEIN SPORTS 1") shares it. */
export const logoKey = (name: string) => chanKey(name).key

/** Where a channel's logo came from (Diagnostics). */
export type LogoFrom = "manual" | "source" | "db" | "none"

/**
 * Logo for one live channel, best first: a manual match, the source's own logo, then the bundled index by name (null = not loaded yet).
 * `alt` = the next one, shown when the first fails to load (providers' logo links often die).
 */
export function logoFor(i: Item, ix: LogoIndex | null, matches: Record<string, string> | undefined): { logo?: string; alt?: string; from: LogoFrom } {
  const k = matches && logoKey(i.name)
  const man = k ? matches![k] : undefined
  const db = ix ? findLogo(ix, i.name, i.group, i.epgId) : undefined
  const list = [man, i.logo, db]
  const n = list.findIndex(Boolean)
  if (n < 0) return { from: "none" }
  return { logo: list[n], alt: list.slice(n + 1).find((x) => x && x !== list[n]), from: (["manual", "source", "db"] as const)[n] }
}

/** Live channels get `logo` / `logoAlt` from logoFor. `items` must be the source's own (raw) items. Returns `items` itself when nothing changes. */
export function applyLogos(items: Item[], ix: LogoIndex | null, matches: Record<string, string> | undefined): Item[] {
  let changed = false
  const out = items.map((i) => {
    if (i.kind !== "live") return i
    const { logo, alt } = logoFor(i, ix, matches)
    if (logo === i.logo && alt === i.logoAlt) return i
    changed = true
    return { ...i, logo, logoAlt: alt }
  })
  return changed ? out : items
}

/** Text for the no-logo tile: the name without provider prefix / quality words, its trailing number apart ("AR| beIN SPORTS 1 HD" -> "beIN SPORTS", "1"); `brand` picks the tile colour, the same for every channel of a brand. */
export function tileName(name: string): { title: string; num?: string; brand: string } {
  let s = name.normalize("NFKC")
  for (let i = 0, m; i < 3 && (m = PREFIX.exec(s)); i++) s = s.slice(m[0].length)
  const words = s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").split(/[\s|_]+/).filter((w) => w && !NOISE.has(w.toLowerCase()))
  const num = words.length > 1 && /^\+?[\d٠-٩]{1,3}$/.test(words[words.length - 1]) ? words.pop() : undefined
  const title = words.join(" ") || name.trim()
  return { title, num, brand: (chanKey(title).words[0] ?? title).toLowerCase() }
}
