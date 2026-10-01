import { useMemo } from "react"
import { progressPct } from "./hooks/use-live"
import { hm, nowNext, useCatalog } from "@/lib/catalog"
import { useApp, usePData, useSource } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { useOpen } from "@/components/tv/ui"
import type { Item, Kind } from "@/lib/types"

const CAP = 20

export type HeroPick = { item: Item; kicker: string }
export type HomeRail = {
  key: string
  title: string
  kind: "wide" | "poster"
  items: Item[]
  /** progress percent for an item (Continue watching only) */
  pct?: (i: Item) => number | undefined
  /** secondary line (live: current programme) */
  sub?: (i: Item) => string | undefined
  /** open the category page */
  seeAll?: () => void
}

/** Everything a layout's Home needs; layouts only decide how to render it. */
export function useHomeData() {
  const status = useCatalog((s) => s.status) // idle | loading | ready | error
  const msg = useCatalog((s) => s.msg)
  const byId = useCatalog((s) => s.byId)
  const byKind = useCatalog((s) => s.byKind)
  const groups = useCatalog((s) => s.groups)
  const epg = useCatalog((s) => s.epg)
  useCatalog((s) => s.epgTick)
  const d = usePData()
  const src = useSource()
  const go = useRoute((s) => s.go)
  const openItem = useOpen()
  const toggleFav = useApp((s) => s.toggleFav)
  const proxy = useApp((s) => s.settings.proxy)

  const data = useMemo(() => {
    const get = (ids: string[]) => ids.map((i) => byId.get(i)).filter(Boolean).slice(0, CAP) as Item[]
    const p = Object.entries(d.progress).filter(([, v]) => v.dur > 0 && v.pos / v.dur < 0.95 && v.pos > 30).sort((a, b) => b[1].t - a[1].t).map(([k]) => k)
    const genre = (k: Kind) => {
      const first = groups[k].slice(0, 6)
      const m = new Map<string, Item[]>(first.map((g) => [g, []]))
      for (const i of byKind[k]) { const l = m.get(i.group); if (l && l.length < CAP) l.push(i) }
      return first.map((g) => ({ k, g, items: m.get(g)! })).filter((r) => r.items.length)
    }
    const cont = get(p), favs = get(d.favs), recents = get(d.recents), live = byKind.live.slice(0, CAP)
    // hero: last continue-watching, else a favorite, else a day-stable VOD pick, else first channel
    const vod = [...byKind.movie, ...byKind.series]
    const day = Math.floor(Date.now() / 864e5)
    const hero = cont[0] ?? favs[0] ?? (vod.length ? vod[day % vod.length] : undefined) ?? byKind.live[0]
    const kicker = (i: Item) => (cont[0] === i ? "Continue watching" : favs[0] === i ? "Favorite" : "Featured")
    // carousel candidates (up to 5, distinct, hero first)
    const featured: HeroPick[] = []
    const add = (i: Item | undefined, k?: string) => { if (i && featured.length < 5 && !featured.some((f) => f.item === i)) featured.push({ item: i, kicker: k ?? "Featured" }) }
    add(hero, hero && kicker(hero))
    add(favs[0], "Favorite")
    for (let n = 0; n < vod.length && featured.length < 5; n++) add(vod[(day + n * 7) % vod.length])
    if (!featured.length) add(byKind.live[0])
    const pct = (i: Item) => { const p = d.progress[i.id]; return p ? (p.pos / p.dur) * 100 : undefined }
    const sub = (i: Item) => { const n = nowNext(epg, i.epgId).now; return n ? `${hm(n.s)} ${n.t}` : undefined }
    const livePct = (i: Item) => { const n = nowNext(epg, i.epgId).now; return n ? progressPct(n.s, n.e) : undefined }
    const seeAll = (k: Kind, g: string) => () => go("category", { id: `${k}|${g}` })
    const rails: HomeRail[] = []
    if (cont.length) rails.push({ key: "cont", title: "Continue watching", kind: "wide", items: cont, pct })
    if (favs.length) rails.push({ key: "favs", title: "Favorites", kind: "wide", items: favs })
    if (recents.length) rails.push({ key: "recents", title: "Recently watched", kind: "wide", items: recents })
    if (live.length) rails.push({ key: "live", title: "Live now", kind: "wide", items: live, sub, pct: livePct })
    for (const r of [...genre("movie"), ...genre("series")]) {
      const title = `${r.k === "movie" ? "Movies" : "Shows"} · ${r.g}`
      rails.push({ key: r.k + r.g, title, kind: "poster", items: r.items, seeAll: seeAll(r.k, r.g) })
    }
    const hp: HeroPick | undefined = hero ? { item: hero, kicker: kicker(hero) } : undefined
    return { hero: hp, featured, rails, live, favIds: d.favs }
  }, [d, byId, byKind, groups, epg, go])

  return {
    status, msg, ...data,
    /** open an item; `from` = the rail's items (live ones become the zapping queue) */
    open: (i: Item, from?: Item[]) => openItem(i, from?.filter((x) => x.kind === "live")),
    /** play/open from the hero: live items zap within the first channels */
    play: (i: Item) => openItem(i, data.live),
    info: (i: Item) => openItem(i),
    toggleFav: (i: Item) => toggleFav(i.id),
    isFav: (i: Item) => data.favIds.includes(i.id),
    retry: () => src && useCatalog.getState().load(src, proxy, true),
    changeSource: () => go("sources"),
    sourceName: src?.name,
  }
}
