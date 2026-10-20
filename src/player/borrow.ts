import { useCatalog } from "@/lib/catalog"
import { srcOfId } from "@/lib/merge-pure"
import { plexDetail, plexSegments } from "@/lib/plex"
import { jellyfinDetail, jellyfinSegments } from "@/lib/jellyfin"
import { useApp } from "@/lib/store"
import type { Episode, Item } from "@/lib/types"
import type { PSeg } from "./skip-pure"
import { epOf } from "./util"

const eps = new Map<string, Promise<Episode[]>>() // Plex/Jellyfin series copy id -> its episode list, once per session

/** An IPTV episode has no timings of its own; if the same show (merged under one card) also sits on a Plex/Jellyfin server, use that server's markers for the same S/E.
    ponytail: assumes both copies are the same cut; a different intro length is covered by the user's saved marks, which rank above this. */
export async function borrowSegs(item: Item): Promise<PSeg[]> {
  const code = epOf(item.name), cat = useCatalog.getState(), st = useApp.getState()
  const sr = item.series ? cat.byId.get(item.series) : undefined
  if (!code || !sr) return []
  const prim = cat.primaryOf.get(sr.id) ?? sr
  for (const c of [prim, ...(prim.alts ?? [])]) {
    const src = st.sources.find((x) => x.id === srcOfId(c.id))
    if (!src || (src.type !== "plex" && src.type !== "jellyfin")) continue
    let p = eps.get(c.id)
    if (!p) {
      p = (src.type === "plex" ? plexDetail : jellyfinDetail)(src, st.settings.proxy, c).then((r) => r.episodes)
      p.catch(() => eps.delete(c.id))
      eps.set(c.id, p)
    }
    const e = (await p.catch(() => [])).find((x) => x.season === code.s && x.num === code.e)
    const r = e ? await (src.type === "plex" ? plexSegments : jellyfinSegments)(src, e.item).catch(() => []) : []
    if (r.length) return r
  }
  return []
}
