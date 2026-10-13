import type { Episode, Item, Source } from "./types"
import { fetchT, px } from "./net"
import { t } from "./i18n"
import { hasStreamFacts, streamInfo } from "./meta/facts-pure"
import { day } from "./browse-pure"

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

/** One part of the catalog (live channels, movies or series). */
export async function loadXtreamKind(s: Source, proxy: string, kind: XtreamKind, step: (m: string) => void): Promise<Item[]> {
  const [, cats, list, msg] = XTREAM_KINDS.find((k) => k[0] === kind)!
  step(t(msg))
  const [c, l] = await Promise.all([call<R[]>(s, proxy, cats), call<R[]>(s, proxy, list)])
  const names = new Map(arr<R>(c).map((x) => [String(x.category_id), String(x.category_name)]))
  const out: Item[] = []
  for (const x of arr<R>(l)) {
    const sid = String(kind === "series" ? x.series_id : x.stream_id)
    out.push({
      id: `${s.id}|${kind}|${sid}`,
      kind,
      sid,
      name: String(x.name ?? "?"),
      group: names.get(String(x.category_id)) ?? "Other",
      logo: String((kind === "series" ? x.cover : x.stream_icon) ?? "") || undefined,
      epgId: x.epg_channel_id ? String(x.epg_channel_id) : undefined,
      ext: x.container_extension ? String(x.container_extension) : undefined,
      num: x.num ? Number(x.num) : undefined,
      rating: x.rating ? String(x.rating) : undefined,
      year: String(x.year ?? x.releaseDate ?? x.release_date ?? "").match(/^(?:19|20)\d{2}/)?.[0], // "2023" or "2023-05-01"
      released: day(x.releaseDate ?? x.release_date),
      added: Number(kind === "series" ? x.last_modified : x.added) || undefined, // series: last update = newest episode
      plot: x.plot ? String(x.plot) : undefined,
    })
  }
  return out
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
