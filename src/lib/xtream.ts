import type { Episode, Item, Source } from "./types"
import { fetchT, px } from "./net"
import { t } from "./i18n"
import { hasStreamFacts, streamInfo } from "./meta/facts-pure"
import { mapXtream } from "./xtream-map"
import ParseWorker from "./xtream.worker?worker&inline"
import type { Answer, Ask } from "./xtream.worker"

const base = (s: Source) => s.server!.replace(/\/+$/, "")
const api = (s: Source, action = "", extra = "") =>
  `${base(s)}/player_api.php?username=${encodeURIComponent(s.user!)}&password=${encodeURIComponent(s.pass!)}${action ? `&action=${action}` : ""}${extra}`

async function call<T>(s: Source, proxy: string, action = "", extra = ""): Promise<T> {
  return (await fetchT(px(api(s, action, extra), proxy))).json()
}
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
type R = Record<string, string | number | undefined>

export function xtreamUrl(s: Source, kind: "live" | "movie" | "series", sid: string, ext: string) {
  return `${base(s)}/${kind}/${encodeURIComponent(s.user!)}/${encodeURIComponent(s.pass!)}/${sid}.${ext}`
}

/** The three parts of an Xtream catalog, in the order they load: a TV shows channels while the movies and the series are still coming. */
export const XTREAM_KINDS = [
  ["live", "get_live_categories", "get_live_streams", "errors.source.loadingChannels"],
  ["movie", "get_vod_categories", "get_vod_streams", "errors.source.loadingMovies"],
  ["series", "get_series_categories", "get_series", "errors.source.loadingSeries"],
] as const
export type XtreamKind = (typeof XTREAM_KINDS)[number][0]

/** The login, asked once before the first part is fetched (a bad account must not look like an empty catalog). */
export async function xtreamAuth(s: Source, proxy: string) {
  const auth = await call<{ user_info?: { auth?: number; status?: string } }>(s, proxy)
  if (!auth.user_info || auth.user_info.auth === 0) throw new Error(t("errors.source.loginFailed"))
}

/* The parse worker: started on the first fetched part, reused. It answers a ping before the first part is posted, so a worker that cannot start
   (a blocked blob worker) is known while the buffers are still ours: they are parsed here as before. Parts are then TRANSFERRED, not copied
   (a 40 MB copy on a TV costs as much as the parse); if the worker dies mid-parse the answer is null and the caller fetches the part again. */
let worker: Promise<Worker | null> | undefined
let seq = 0
const waiting = new Map<number, (a: Answer | null) => void>() // null = no answer from the worker: parse on this thread
const startWorker = () => new Promise<Worker | null>((res) => {
  let w: Worker
  try { w = new ParseWorker() } catch { return res(null) }
  const fail = () => { w.terminate(); res(null) }
  const timer = setTimeout(fail, 5000) // never answered: treat as not started
  w.onerror = () => { clearTimeout(timer); fail() }
  w.onmessage = () => {
    clearTimeout(timer)
    w.onmessage = (e: MessageEvent<Answer>) => { waiting.get(e.data.n)?.(e.data); waiting.delete(e.data.n) }
    w.onerror = () => { w.terminate(); worker = Promise.resolve(null); for (const f of waiting.values()) f(null); waiting.clear() }
    res(w)
  }
  w.postMessage({ n: 0 }) // ping: no buffers
})
async function viaWorker(ask: Omit<Ask, "n">): Promise<Answer | null> {
  const w = await (worker ??= startWorker())
  if (!w) return null
  const n = ++seq
  return new Promise((res) => { waiting.set(n, res); w.postMessage({ ...ask, n }, [ask.cats, ask.list]) })
}

/** One part of the catalog (live channels, movies or series). */
export async function loadXtreamKind(s: Source, proxy: string, kind: XtreamKind, step: (m: string) => void): Promise<Item[]> {
  const [, cats, list, msg] = XTREAM_KINDS.find((k) => k[0] === kind)!
  step(t(msg))
  const raw = (action: string) => fetchT(px(api(s, action), proxy)).then((r) => r.arrayBuffer())
  const fetchBoth = () => Promise.all([raw(cats), raw(list)])
  let [c, l] = await fetchBoth()
  const a = await viaWorker({ sourceId: s.id, kind, cats: c, list: l })
  if (a?.error) throw new SyntaxError(a.error) // not JSON: what .json() threw before
  if (a?.items) return a.items
  if (!a && (c.byteLength === 0 || l.byteLength === 0)) [c, l] = await fetchBoth() // transferred to a worker that died: the buffers are gone
  const dec = new TextDecoder()
  return mapXtream(s.id, kind, JSON.parse(dec.decode(c)), JSON.parse(dec.decode(l)))
}

/** Account status from the panel: expiry (ms, 0 = never), connections in use vs allowed (max 0 = unknown); null when unreachable. */
export async function accountInfo(s: Source, proxy: string): Promise<{ status?: string; exp: number; act: number; max: number } | null> {
  try {
    const ui = (await (await fetchT(px(api(s), proxy), 8000)).json())?.user_info
    return ui ? { status: ui.status, exp: Number(ui.exp_date) * 1000 || 0, act: Number(ui.active_cons) || 0, max: Number(ui.max_connections) || 0 } : null
  } catch { return null }
}

/** Connections in use vs allowed, for the "max connections" message; null when the server won't say. */
export async function connInfo(s: Source, proxy: string): Promise<{ act: number; max: number } | null> {
  const a = await accountInfo(s, proxy)
  return a?.max ? { act: a.act, max: a.max } : null
}

export async function vodInfo(s: Source, proxy: string, sid: string) {
  const r = await call<{ info?: R; movie_data?: R }>(s, proxy, "get_vod_info", `&vod_id=${sid}`)
  return { ...r.info, added: r.movie_data?.added, container: r.movie_data?.container_extension } // streamInfo() reads these
}

/** Current and upcoming programme data, when the Xtream panel exposes its short EPG. */
export async function xtreamShortEpg(s: Source, proxy: string, sid: string): Promise<R[]> {
  const r = await call<{ epg_listings?: R[] }>(s, proxy, "get_short_epg", `&stream_id=${encodeURIComponent(sid)}&limit=6`)
  return arr<R>(r.epg_listings)
}

export async function seriesInfo(s: Source, proxy: string, series: Item) {
  const r = await call<{ info?: R; episodes?: Record<string, R[]> }>(s, proxy, "get_series_info", `&series_id=${series.sid}`)
  const eps: Episode[] = []
  const bySeason = Array.isArray(r.episodes) ? { "1": r.episodes as R[] } : (r.episodes ?? {})
  for (const [season, list] of Object.entries(bySeason)) {
    for (const e of arr<R>(list)) {
      const ext = String(e.container_extension || "mp4")
      const info = (e.info ?? {}) as R
      const num = Number(e.episode_num) || 0
      eps.push({
        id: String(e.id),
        season: Number(season),
        num,
        title: String(e.title ?? `Episode ${num}`),
        dur: info.duration ? String(info.duration) : undefined,
        item: {
          id: `${s.id}|ep|${e.id}`,
          kind: "movie",
          name: `${series.name} S${season}E${num}`,
          group: series.name,
          series: series.id,
          logo: String(info.movie_image ?? "") || series.logo,
          url: xtreamUrl(s, "series", String(e.id), ext),
          plot: info.plot ? String(info.plot) : undefined,
          ...(hasStreamFacts(streamInfo(info)) ? { stream: streamInfo(info) } : {}),
        },
      })
    }
  }
  eps.sort((a, b) => a.season - b.season || a.num - b.num)
  return { info: r.info ?? {}, episodes: eps }
}
