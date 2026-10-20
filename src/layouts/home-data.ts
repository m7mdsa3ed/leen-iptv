import { catsOf } from "@/lib/merge-pure"
import { useEffect, useMemo } from "react"
import { fmt, t, useLang } from "@/lib/i18n"
import { useNotify } from "@/lib/notify"
import { accountInfo } from "@/lib/xtream"
import { useCatalog } from "@/lib/catalog"
import { useApp, usePData } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { useOpen } from "@/components/tv/ui"
import type { Item, Kind, Source } from "@/lib/types"
import { useSources } from "@/lib/sources"
import { inSource, useActiveFilter, useCatalogView } from "./hooks/use-source-filter"

const CAP = 20

/** Home rows the user can reorder / hide (Settings > Display). A rail key maps to one of these. */
export const HOME_ROWS = ["cont", "favs", "games", "movies", "series"] as const
export const homeRowOf = (key: string) => (["cont", "favs", "games"].includes(key) ? key : key.startsWith("movie") ? "movies" : "series")

export type HeroPick = { item: Item; kicker: string }
export type HomeRail = {
  key: string
  title: string
  kind: "wide" | "poster"
  /** card shape to draw (defaults to kind): personal rails with movies/shows use posters like every other VOD rail, channels stay wide */
  card?: "wide" | "poster"
  items: Item[]
  /** progress percent for an item (Continue watching only) */
  pct?: (i: Item) => number | undefined
  /** secondary line (live: current programme) */
  sub?: (i: Item) => string | undefined
  /** open the category page */
  seeAll?: () => void
}

const DAY = 86400000
const checked = new Set<string>() // ponytail: once per app session per source; a daily stamp in localStorage if that nags too much

/** Toast on Home when an Xtream subscription has ended or ends within 7 days. */
function useExpiryWarning(sources: Source[], proxy: string) {
  useEffect(() => {
    const todo = sources.filter((s) => s.type === "xtream" && !checked.has(s.id))
    if (!todo.length) return
    todo.forEach((s) => checked.add(s.id))
    void Promise.all(todo.map((s) => accountInfo(s, proxy).then((a) => ({ s, exp: a?.exp ?? 0 })))).then((r) => {
      const now = Date.now()
      const lines = r.filter((x) => x.exp && x.exp - now < 7 * DAY).map(({ s, exp }) => {
        const date = fmt.date(exp, { dateStyle: "medium" })
        return exp < now ? t("hooks.expiry.ended", { name: s.name, date }) : t("hooks.expiry.soon", { name: s.name, date, n: Math.ceil((exp - now) / DAY) })
      })
      if (lines.length) useNotify.getState().push({ title: t("hooks.expiry.title"), body: lines.join(" · ") })
    })
  }, [sources, proxy])
}

/** Everything a layout's Home needs; layouts only decide how to render it. */
export function useHomeData() {
  const status = useCatalog((s) => s.status) // idle | loading | ready | error
  const msg = useCatalog((s) => s.msg)
  const byId = useCatalog((s) => s.byId)
  const { byKind, groups } = useCatalogView()
  const filter = useActiveFilter()
  const enabled = useSources()
  const d = usePData()
  const go = useRoute((s) => s.go)
  const openItem = useOpen()
  const toggleFav = useApp((s) => s.toggleFav)
  const proxy = useApp((s) => s.settings.proxy)
  useExpiryWarning(enabled, proxy)
  const homeOrder = useApp((s) => s.settings.homeOrder), homeHide = useApp((s) => s.settings.homeHide)
  const { lang } = useLang() // t() below is non-reactive: rebuild on language change

  const data = useMemo(() => {
    const get = (ids: string[]) => ids.map((i) => byId.get(i)).filter((x) => x && inSource(x, filter)).slice(0, CAP) as Item[]
    const p = Object.entries(d.progress).filter(([, v]) => v.dur > 0 && v.pos / v.dur < 0.95 && v.pos > 30).sort((a, b) => b[1].t - a[1].t).map(([k]) => k)
    const genre = (k: Kind) => {
      const first = groups[k].slice(0, 6)
      const m = new Map<string, Item[]>(first.map((g) => [g, []]))
      for (const i of byKind[k]) for (const c of catsOf(i)) { const l = m.get(c); if (l && l.length < CAP) l.push(i) }
      return first.map((g) => ({ k, g, items: m.get(g)! })).filter((r) => r.items.length)
    }
    const cont = get(p), favs = get(d.favs), live = byKind.live.slice(0, CAP)
    // hero: last continue-watching, else a favorite, else a day-stable VOD pick, else first channel
    const vod = [...byKind.movie, ...byKind.series]
    const day = Math.floor(Date.now() / 864e5)
    const hero = cont[0] ?? favs[0] ?? (vod.length ? vod[day % vod.length] : undefined) ?? byKind.live[0]
    const kicker = (i: Item) => (cont[0] === i ? t("common.continueWatching") : favs[0] === i ? t("common.favorite") : t("common.featured"))
    // carousel candidates (up to 5, distinct, hero first)
    const featured: HeroPick[] = []
    const add = (i: Item | undefined, k?: string) => { if (i && featured.length < 5 && !featured.some((f) => f.item === i)) featured.push({ item: i, kicker: k ?? t("common.featured") }) }
    add(hero, hero && kicker(hero))
    add(favs[0], t("common.favorite"))
    for (let n = 0; n < vod.length && featured.length < 5; n++) add(vod[(day + n * 7) % vod.length])
    if (!featured.length) add(byKind.live[0])
    const pct = (i: Item) => { const p = d.progress[i.id]; return p ? (p.pos / p.dur) * 100 : undefined }
    const seeAll = (k: Kind, g: string) => () => go("category", { id: `${k}|${g}` })
    const rails: HomeRail[] = []
    const card = (l: Item[]) => (l.some((i) => i.kind !== "live") ? "poster" : "wide") as "wide" | "poster"
    if (cont.length) rails.push({ key: "cont", title: t("common.continueWatching"), kind: "wide", card: card(cont), items: cont, pct })
    if (favs.length) rails.push({ key: "favs", title: t("common.favorites"), kind: "wide", card: card(favs), items: favs })
    rails.push({ key: "games", title: "", kind: "wide", items: [] }) // slot only: the layout fills it with sports games, so it orders/hides like any row
    for (const r of [...genre("movie"), ...genre("series")]) {
      const title = t(r.k === "movie" ? "common.moviesIn" : "common.showsIn", { g: r.g })
      rails.push({ key: r.k + r.g, title, kind: "poster", items: r.items, seeAll: seeAll(r.k, r.g) })
    }
    const order: readonly string[] = homeOrder?.length ? homeOrder : HOME_ROWS, hide = homeHide ?? []
    const rank = (r: HomeRail) => { const i = order.indexOf(homeRowOf(r.key)); return i < 0 ? 99 : i }
    rails.splice(0, rails.length, ...rails.filter((r) => !hide.includes(homeRowOf(r.key))).sort((a, b) => rank(a) - rank(b))) // stable: genre rails keep their order
    const hp: HeroPick | undefined = hero ? { item: hero, kicker: kicker(hero) } : undefined
    return { hero: hp, featured, rails, live, favIds: d.favs }
  }, [d, byId, byKind, groups, go, filter, lang, homeOrder, homeHide])

  return {
    status, msg, ...data,
    /** open an item; `from` = the rail's items (live ones become the zapping queue) */
    open: (i: Item, from?: Item[]) => openItem(i, from?.filter((x) => x.kind === "live")),
    /** play/open from the hero: live items zap within the first channels */
    play: (i: Item) => openItem(i, data.live),
    info: (i: Item) => openItem(i),
    toggleFav: (i: Item) => toggleFav(i.id),
    isFav: (i: Item) => data.favIds.includes(i.id),
    retry: () => void useCatalog.getState().loadAll(useApp.getState().sources, proxy, true),
    changeSource: () => go("sources"),
    sourceName: enabled.length === 1 ? enabled[0].name : undefined, // several sources: no single name
  }
}
