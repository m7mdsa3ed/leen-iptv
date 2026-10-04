import type { Item } from "./types"

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


