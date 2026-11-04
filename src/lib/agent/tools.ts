import { get } from "idb-keyval"
import { useCatalog } from "@/lib/catalog"
import { jellyfinDetail } from "@/lib/jellyfin"
import { srcOfId } from "@/lib/merge-pure"
import { plexDetail } from "@/lib/plex"
import { useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"
import type { Episode, Item } from "@/lib/types"
import { seriesInfo } from "@/lib/xtream"
import { usePlayerHost } from "@/player/host"
import { playerCtl } from "./bus"
import { inOrder, locked, rank, resumeIndex, shelfProgram, suggest, type Kind } from "./pure"
import { getChecker } from "./screen"
import { dockVoice, showProgram } from "./ui"

type Args = Record<string, unknown>
type Out = Record<string, unknown>
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const KINDS = ["all", "movie", "series", "live"] as const
const PAGES = ["home", "live", "movies", "series", "sports", "history", "settings"]

const profile = () => { const s = useApp.getState(); return s.profiles.find((p) => p.id === s.profileId) ?? null }
const pdata = () => { const s = useApp.getState(); return (s.profileId && s.data[s.profileId]) || { favs: [], recents: [], progress: {} } }
const allowed = (i: Item) => !locked(profile(), i)
const row = (i: Item) => ({ id: i.id, name: i.name, kind: i.kind, ...(i.year ? { year: i.year } : {}), category: i.group })
/** An id the model got from search/suggest; anything else (a made-up id, a hidden alt) is refused. */
const find = (id: string) => { const i = useCatalog.getState().byId.get(id); return i && allowed(i) ? useCatalog.getState().primaryOf.get(id) ?? i : undefined }

/** One line about the screen, for the model's instructions: where the user is and what is playing. */
export function describeNow(): string {
  const top = useRoute.getState().stack.slice(-1)[0]
  const ctl = playerCtl()
  const cur = usePlayerHost.getState().cur
  const name = cur?.queue[cur.index]?.name
  if (ctl && name) return `playing "${name}"${ctl.live ? " (live)" : ""}, ${ctl.paused ? "paused" : "running"}.`
  return `on the ${top?.name ?? "home"} page, nothing playing.`
}

async function episodesOf(series: Item): Promise<Episode[]> {
  const st = useApp.getState()
  const src = st.sources.find((x) => x.id === srcOfId(series.id))
  if (!src || !series.sid) return []
  const cached = await get<{ v?: { episodes?: Episode[] } }>(`det:${series.id}`).catch(() => undefined) // the Detail page's copy, if this device opened the show
  if (cached?.v?.episodes?.length) return cached.v.episodes
  if (src.type === "plex") return (await plexDetail(src, st.settings.proxy, series)).episodes
  if (src.type === "jellyfin") return (await jellyfinDetail(src, st.settings.proxy, series)).episodes
  if (src.type === "xtream") return (await seriesInfo(src, st.settings.proxy, series)).episodes
  return []
}

/** Start `item`: in the running player when there is one (its route is already up), else a new player route. A show plays the episode the user is on. */
async function start(item: Item, fromStart: boolean): Promise<Out> {
  const ctl = playerCtl()
  if (item.kind === "series") {
    const eps = inOrder((await episodesOf(item)).map((e) => ({ ...e, id: e.item.id })))
    if (!eps.length) return { error: "That show has no episodes on this source yet." }
    const i = fromStart ? 0 : resumeIndex(eps, pdata().progress)
    const queue = eps.map((e) => e.item)
    if (ctl) ctl.playItem(queue[i], queue, fromStart)
    else useRoute.getState().go("player", { queue, index: i, start: fromStart || undefined })
    dockVoice()
    return { playing: `${item.name} season ${eps[i].season} episode ${eps[i].num}` }
  }
  const list = item.kind === "live" ? useCatalog.getState().byKind.live.filter((x) => x.group === item.group && allowed(x)) : [item]
  const queue = list.includes(item) ? list : [item]
  if (ctl) ctl.playItem(item, queue, fromStart)
  else useRoute.getState().go("player", { queue, index: queue.indexOf(item), start: fromStart || undefined })
  dockVoice()
  return { playing: item.name }
}

const TOOLS: Record<string, (a: Args) => Promise<Out> | Out> = {
  search(a) {
    const q = str(a.query), kind = KINDS.find((k) => k === a.kind) ?? "all"
    if (!q) return { error: "Say what to search for." }
    const hits = rank(useCatalog.getState().items.filter(allowed), q, kind as Kind | "all", 8)
    return hits.length ? { results: hits.map(row) } : { results: [], note: "Nothing matched. Locked categories are not searched." }
  },
  open(a) {
    const i = find(str(a.id))
    if (!i) return { error: "Unknown id. Search first." }
    if (i.kind === "live") return start(i, false)
    useRoute.getState().go("detail", { id: i.id })
    dockVoice()
    return { opened: i.name }
  },
  play(a) {
    const i = find(str(a.id))
    return i ? start(i, a.from_start === true) : { error: "Unknown id. Search first." }
  },
  player(a) {
    const c = playerCtl()
    if (!c) return { error: "Nothing is playing." }
    switch (a.action) {
      case "pause": c.pause(); return { paused: true }
      case "resume": c.play(); return { paused: false }
      case "stop": c.stop(); return { stopped: true }
      case "next": c.next(); return { ok: true }
      case "previous": c.prev(); return { ok: true }
      case "seek": {
        if (c.live) return { error: "Live TV cannot be skipped." }
        const s = Number(a.seconds)
        if (!Number.isFinite(s) || s === 0) return { error: "Say how many seconds." }
        c.seek(Math.max(-3600, Math.min(3600, s))); return { ok: true }
      }
      default: return { error: "Unknown action." }
    }
  },
  go(a) {
    const page = str(a.page)
    if (!PAGES.includes(page)) return { error: "Unknown page." }
    useRoute.getState().reset(page)
    dockVoice()
    return { page }
  },
  suggest(a) {
    const st = useCatalog.getState(), d = pdata()
    const kind = (["any", "movie", "series", "live"] as const).find((k) => k === a.kind) ?? "any"
    const fresh = [...st.byKind.movie, ...st.byKind.series].sort((x, y) => (y.added ?? 0) - (x.added ?? 0)).slice(0, 12)
    const picks = suggest({ progress: d.progress, favs: d.favs, recents: d.recents, get: (id) => st.byId.get(id), fresh, kind, ok: allowed, max: 6 })
    if (!picks.length) return { picks: [], note: "Nothing to suggest yet." }
    showProgram(shelfProgram("Picked for you", picks.map((p) => p.item.id))) // on screen while the model names them
    return { picks: picks.map((p) => ({ ...row(p.item), why: p.why })), note: "These are on the TV screen now." }
  },
  show(a) {
    const check = getChecker()
    if (!check) return { error: "The screen is not ready. Just say it." }
    const program = str(a.program).replace(/^```[\w-]*\s*|\s*```$/g, "")
    const r = check(program)
    if (!r.ok) return { error: `Not drawn: ${r.error}` }
    const known = r.ids.filter((id) => find(id))
    if (r.ids.length && !known.length) return { error: "Not drawn: none of those ids exist. Use ids from search or suggest." }
    showProgram(program)
    return { drawn: true, ...(known.length < r.ids.length ? { note: `${r.ids.length - known.length} unknown ids are left out.` } : {}) }
  },
  channel(a) {
    const q = str(a.name)
    if (!q) return { error: "Say which channel." }
    const hit = rank(useCatalog.getState().byKind.live.filter(allowed), q, "live", 3)
    if (!hit.length) return { error: "No channel by that name." }
    return start(hit[0], false).then((r) => ({ ...r, alternatives: hit.slice(1).map((x) => x.name) }))
  },
}

/** Run one tool call from the model. Never throws: a failure is the result the model hears about. */
export async function runTool(name: string, args: unknown): Promise<Out> {
  const f = TOOLS[name]
  if (!f) return { error: `Unknown tool ${name}.` }
  try { return await f((args && typeof args === "object" ? args : {}) as Args) }
  catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
}
