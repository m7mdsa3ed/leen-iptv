import { catsOf } from "@/lib/merge-pure"
import { resumable } from "@/lib/progress-pure"
import { useCallback, useEffect, useMemo } from "react"
import { fmt, t, useLang } from "@/lib/i18n"
import { useNotify } from "@/lib/notify"
import { accountInfo } from "@/lib/xtream"
import { useCatalog } from "@/lib/catalog"
import { useApp, usePData, useProfile } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { askPin, useOpen } from "@/components/tv/ui"
import type { Item, Kind, Source } from "@/lib/types"
import { useSources } from "@/lib/sources"
import { isTv } from "@/lib/device"
import { inSource, useActiveFilter, useCatalogView } from "./hooks/use-source-filter"
import { useStable } from "./hooks/use-category"

// Home is the heaviest screen: every card that mounts paints its artwork and queues a metadata lookup, and the D-pad measures every rail.
// TV trims each row and the rails on it; desktop keeps the full rows.
const CAP = isTv ? 14 : 20 // cards painted per rail
const LIVE = 20 // the home play queue, which is never painted
const GENRE_RAILS = isTv ? 2 : 6 // genre rails per kind (movies, series); 0 = none on TV
const FEATURED = isTv ? 5 : 6 // stage picks (only the shown one paints its full backdrop; the others are thumbnails)
const PICK_TRIES = 80 // day-stable picks tried for one with a backdrop before taking any

/** Home rows the user can reorder / hide (Settings > Display). A rail key maps to one of these. */
export const HOME_ROWS = ["cont", "favs", "live", "games", "added", "movies", "series"] as const
const OWN_ROWS = ["cont", "favs", "games", "live", "added"]
export const homeRowOf = (key: string) => (OWN_ROWS.includes(key) ? key : key.startsWith("movie") ? "movies" : "series")

/** The newest `n` movies/series by `added`, in one pass (no sort of the whole catalog). */
function newest(lists: Item[][], n: number): Item[] {
  const top: Item[] = []
  for (const l of lists) for (const i of l) {
    const a = i.added
    if (!a || (top.length === n && a <= top[n - 1].added!)) continue
    let k = top.length
    while (k > 0 && top[k - 1].added! < a) k--
    top.splice(k, 0, i)
    if (top.length > n) top.pop()
  }
  return top
}

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
  const { progress, favs: favIds, recents } = usePData()
  const profile = useProfile()
  const go = useRoute((s) => s.go)
  const openItem = useOpen()
  const toggleFav = useApp((s) => s.toggleFav)
  const proxy = useApp((s) => s.settings.proxy)
  useExpiryWarning(enabled, proxy)
  const homeOrder = useApp((s) => s.settings.homeOrder), homeHide = useApp((s) => s.settings.homeHide)
  const { lang } = useLang() // t() below is non-reactive: rebuild on language change

  // genre rails: one pass over the whole catalog, so only when the catalog (or the language) changes, not on every progress save
  const genreRails = useMemo(() => {
    const genre = (k: Kind) => {
      const first = groups[k].slice(0, GENRE_RAILS)
      const m = new Map<string, Item[]>(first.map((g) => [g, []]))
      // one pass over the kind: stop as soon as every rail is full instead of walking the whole list
      let left = first.length * CAP
      for (const i of byKind[k]) {
        for (const c of catsOf(i)) { const l = m.get(c); if (l && l.length < CAP) { l.push(i); left-- } }
        if (left <= 0) break
      }
      return first.map((g) => ({ k, g, items: m.get(g)! })).filter((r) => r.items.length)
    }
    const seeAll = (k: Kind, g: string) => () => go("category", { id: `${k}|${g}` })
    return [...genre("movie"), ...genre("series")].map((r): HomeRail => ({
      key: r.k + r.g, title: t(r.k === "movie" ? "common.moviesIn" : "common.showsIn", { g: r.g }), kind: "poster", items: r.items, seeAll: seeAll(r.k, r.g),
    }))
  }, [byKind, groups, go, lang])
  const added = useMemo(() => newest([byKind.movie, byKind.series], CAP), [byKind])

  const data = useMemo(() => {
    const get = (ids: string[]) => ids.map((i) => byId.get(i)).filter((x) => x && inSource(x, filter)).slice(0, CAP) as Item[]
    const p = Object.entries(progress).filter(([, v]) => resumable(v)).sort((a, b) => b[1].t - a[1].t).map(([k]) => k)
    // the play queue keeps full length: it is not painted, it is the zapping list the player gets
    const cont = get(p), favs = get(favIds), live = byKind.live.slice(0, Math.max(CAP, LIVE))
    const channels = (recents.map((i) => byId.get(i)).filter((x) => x?.kind === "live" && inSource(x, filter)) as Item[]).slice(0, CAP)
    // stage: last continue-watching, a favorite, the newest titles, then day-stable VOD picks; titles with a backdrop first (the stage is one big artwork)
    const mv = byKind.movie, nv = mv.length + byKind.series.length
    const vod = (n: number) => (n < mv.length ? mv[n] : byKind.series[n - mv.length]) // = [...movie, ...series][n], without copying both lists
    const day = Math.floor(Date.now() / 864e5)
    const featured: HeroPick[] = []
    const add = (i: Item | undefined, k: string, art = false) => { if (i && featured.length < FEATURED && (!art || i.backdrop) && !featured.some((f) => f.item === i)) featured.push({ item: i, kicker: k }) }
    add(cont[0], t("common.continueWatching"))
    add(favs.find((i) => i.kind !== "live") ?? favs[0], t("gtv.home.fromWatchlist"))
    added.filter((i) => i.backdrop).slice(0, 2).forEach((i) => add(i, t("gtv.home.justAdded")))
    for (let n = 0; n < Math.min(nv, PICK_TRIES) && featured.length < FEATURED; n++) add(vod((day + n * 7) % nv), t("gtv.home.topPick"), true)
    for (let n = 0; n < Math.min(nv, FEATURED * 2) && featured.length < FEATURED; n++) add(vod((day + n * 7) % nv), t("gtv.home.topPick"))
    if (!featured.length) add(channels[0] ?? byKind.live[0], t("gtv.home.liveNow"))
    const pct = (i: Item) => { const p = progress[i.id]; return p && !p.next ? (p.pos / p.dur) * 100 : undefined }
    const rails: HomeRail[] = []
    const card = (l: Item[]) => (l.some((i) => i.kind !== "live") ? "poster" : "wide") as "wide" | "poster"
    if (cont.length) rails.push({ key: "cont", title: t("common.continueWatching"), kind: "wide", items: cont, pct }) // wide: the backdrop + time left reads as "pick up here"
    if (favs.length) rails.push({ key: "favs", title: t("gtv.home.watchlist"), kind: "wide", card: card(favs), items: favs })
    if (channels.length) rails.push({ key: "live", title: t("gtv.home.recentChannels"), kind: "wide", items: channels, seeAll: () => go("live") })
    rails.push({ key: "games", title: "", kind: "wide", items: [] }) // slot only: the layout fills it with sports games, so it orders/hides like any row
    if (added.length) rails.push({ key: "added", title: t("gtv.home.recentlyAdded"), kind: "poster", items: added })
    rails.push(...genreRails)
    const order: readonly string[] = homeOrder?.length ? homeOrder : HOME_ROWS, hide = homeHide ?? []
    const rank = (r: HomeRail) => { const i = order.indexOf(homeRowOf(r.key)); return i < 0 ? 99 : i }
    rails.splice(0, rails.length, ...rails.filter((r) => !hide.includes(homeRowOf(r.key))).sort((a, b) => rank(a) - rank(b))) // stable: genre rails keep their order
    return { featured, rails, live, favIds }
  }, [progress, favIds, recents, byId, byKind, filter, genreRails, added, go, lang, homeOrder, homeHide])
  const favSet = useMemo(() => new Set(favIds), [favIds])
  const live = data.live

  return {
    status, msg, ...data,
    /** open an item; `from` = the rail's items (live ones become the zapping queue) */
    open: useStable((i: Item, from?: Item[]) => openItem(i, from?.filter((x) => x.kind === "live"))),
    /** play/open from the hero: live items zap within the first channels */
    play: useStable((i: Item) => openItem(i, live)),
    info: useStable((i: Item) => openItem(i)),
    /** the stage's main button: a movie plays at once (the player resumes saved progress), a show opens its page (episode pick), live zaps */
    watch: useStable(async (i: Item) => {
      if (i.kind !== "movie") return openItem(i, live)
      const p = profile
      if (p?.pin && p.locked.includes(`${i.kind}|${i.group}`) && !(await askPin(p.pin))) return
      go("player", { queue: [i], index: 0 })
    }),
    toggleFav: useCallback((i: Item) => toggleFav(i.id), [toggleFav]),
    isFav: useCallback((i: Item) => favSet.has(i.id), [favSet]),
    retry: () => void useCatalog.getState().loadAll(useApp.getState().sources, proxy, true),
    changeSource: () => go("sources"),
    sourceName: enabled.length === 1 ? enabled[0].name : undefined, // several sources: no single name
  }
}
