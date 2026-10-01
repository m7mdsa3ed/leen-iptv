import type { Item, Prog } from "./types"

const A_ID = /tvg-id="([^"]*)"/
const A_LOGO = /tvg-logo="([^"]*)"/
const A_GROUP = /group-title="([^"]*)"/
const A_NAME = /tvg-name="([^"]*)"/
const VOD_EXT = /\.(mp4|mkv|avi|mov|m4v)(\?|$)/i

export function parseM3U(text: string, sid: string): Item[] {
  const out: Item[] = []
  let cur: Partial<Item> | null = null
  let n = 0
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim()
    if (!l) continue
    if (l.startsWith("#EXTINF")) {
      const q = l.lastIndexOf('"')
      const name = l.slice(l.indexOf(",", q > 0 ? q : 0) + 1).trim()
      cur = {
        name: name || l.match(A_NAME)?.[1] || "Unnamed",
        logo: l.match(A_LOGO)?.[1] || undefined,
        group: l.match(A_GROUP)?.[1] || "Uncategorized",
        epgId: l.match(A_ID)?.[1] || undefined,
      }
    } else if (cur && !l.startsWith("#")) {
      const kind = /\/movie\//i.test(l) || VOD_EXT.test(l) ? "movie" : "live"
      out.push({ ...cur, id: `${sid}|${kind}|${n++}`, kind, url: l, num: n } as Item)
      cur = null
    }
  }
  return out
}

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" }
const dec = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENT[m])

const ts = (v: string) => {
  const m = v.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*([+-])?(\d\d)?(\d\d)?/)
  if (!m) return NaN
  const off = m[7] ? (m[7] === "-" ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) * 60000 : 0
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - off
}

/** Regex-scan XMLTV (DOMParser chokes on 50MB+ guides on TV CPUs). Keeps only `want` channels in [from,to]. */
export function parseXmltv(xml: string, want: Set<string>, from: number, to: number) {
  const out = new Map<string, Prog[]>()
  const re = /<programme\s([^>]*)>([\s\S]*?)<\/programme>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const at = m[1]
    const ch = at.match(/channel="([^"]*)"/)?.[1]
    if (!ch || !want.has(ch)) continue
    const s = ts(at.match(/start="([^"]*)"/)?.[1] ?? "")
    const e = ts(at.match(/stop="([^"]*)"/)?.[1] ?? "")
    if (!(e > from && s < to)) continue
    const t = m[2].match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]
    const d = m[2].match(/<desc[^>]*>([\s\S]*?)<\/desc>/)?.[1]
    const list = out.get(ch) ?? out.set(ch, []).get(ch)!
    list.push({ s, e, t: dec(t ?? ""), d: d ? dec(d) : undefined })
  }
  for (const l of out.values()) l.sort((a, b) => a.s - b.s)
  return out
}
