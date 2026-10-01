import { create } from "zustand"
import { del, get, set } from "idb-keyval"
import type { Item, Kind, Prog, Source } from "./types"
import { explain, fetchText, px } from "./net"
import { parseM3U, parseXmltv } from "./parse"
import { loadXtream, xmltvUrl } from "./xtream"

const TTL = 12 * 3600_000
const empty = { live: [], movie: [], series: [] } as Record<Kind, string[]>

interface C {
  sourceId: string | null
  status: "idle" | "loading" | "ready" | "error"
  msg: string
  items: Item[]
  byId: Map<string, Item>
  byKind: Record<Kind, Item[]>
  groups: Record<Kind, string[]>
  epg: Map<string, Prog[]>
  epgTick: number
  load: (s: Source, proxy: string, force?: boolean) => Promise<void>
  forget: (id: string) => void
}

function index(items: Item[]) {
  const byKind: Record<Kind, Item[]> = { live: [], movie: [], series: [] }
  const g: Record<Kind, Set<string>> = { live: new Set(), movie: new Set(), series: new Set() }
  for (const i of items) {
    byKind[i.kind].push(i)
    g[i.kind].add(i.group)
  }
  const groups = { live: [...g.live], movie: [...g.movie], series: [...g.series] }
  return { items, byId: new Map(items.map((i) => [i.id, i])), byKind, groups }
}

export const useCatalog = create<C>((setS) => ({
  sourceId: null,
  status: "idle",
  msg: "",
  items: [],
  byId: new Map(),
  byKind: { live: [], movie: [], series: [] },
  groups: empty,
  epg: new Map(),
  epgTick: 0,
  forget: (id) => void del("cat:" + id),
  async load(src, proxy, force) {
    setS({ sourceId: src.id, status: "loading", msg: "Loading", epg: new Map() })
    try {
      let items: Item[] | undefined
      const cached = force ? undefined : await get<{ at: number; items: Item[] }>("cat:" + src.id)
      if (cached && Date.now() - cached.at < TTL) items = cached.items
      if (!items) {
        if (src.type === "xtream") items = await loadXtream(src, proxy, (msg) => setS({ msg }))
        else {
          setS({ msg: "Downloading playlist" })
          items = parseM3U(await fetchText(px(src.url!, proxy)), src.id)
        }
        if (!items.length) throw new Error("No channels found in this source")
        void set("cat:" + src.id, { at: Date.now(), items })
      }
      setS({ ...index(items), status: "ready", msg: "" })
      void loadEpg(src, proxy, force)
    } catch (e) {
      setS({ status: "error", msg: explain(e) })
    }
  },
}))

async function loadEpg(src: Source, proxy: string, force?: boolean) {
  const url = src.epgUrl || (src.type === "xtream" ? xmltvUrl(src) : "")
  if (!url) return
  const want = new Set(useCatalog.getState().byKind.live.map((i) => i.epgId).filter(Boolean) as string[])
  const from = Date.now() - 3 * 3600_000
  const key = "epg:" + src.id
  try {
    let epg: Map<string, Prog[]> | undefined
    const c = force ? undefined : await get<{ at: number; list: [string, Prog[]][] }>(key)
    if (c && Date.now() - c.at < 6 * 3600_000) epg = new Map(c.list)
    if (!epg) {
      epg = parseXmltv(await fetchText(px(url, proxy)), want, from, from + 40 * 3600_000)
      void set(key, { at: Date.now(), list: [...epg] })
    }
    if (useCatalog.getState().sourceId === src.id) useCatalog.setState({ epg, epgTick: Date.now() })
  } catch {
    /* guide is optional: channels still work without it */
  }
}

export function nowNext(epg: Map<string, Prog[]>, id?: string, at = Date.now()) {
  const l = id ? epg.get(id) : undefined
  if (!l) return {}
  const i = l.findIndex((p) => p.e > at)
  return i < 0 ? {} : l[i].s <= at ? { now: l[i], next: l[i + 1] } : { next: l[i] }
}

export const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
