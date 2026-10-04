import type { Episode, Item, Source } from "./types"
import { fetchT, px } from "./net"
import { t } from "./i18n"

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

export async function loadXtream(s: Source, proxy: string, step: (m: string) => void): Promise<Item[]> {
  const auth = await call<{ user_info?: { auth?: number; status?: string } }>(s, proxy)
  if (!auth.user_info || auth.user_info.auth === 0) throw new Error(t("errors.source.loginFailed"))
  const out: Item[] = []
  for (const [kind, cats, list] of [
    ["live", "get_live_categories", "get_live_streams"],
    ["movie", "get_vod_categories", "get_vod_streams"],
    ["series", "get_series_categories", "get_series"],
  ] as const) {
    step(t(kind === "live" ? "errors.source.loadingChannels" : kind === "movie" ? "errors.source.loadingMovies" : "errors.source.loadingSeries"))
    const [c, l] = await Promise.all([call<R[]>(s, proxy, cats), call<R[]>(s, proxy, list)])
    const names = new Map(arr<R>(c).map((x) => [String(x.category_id), String(x.category_name)]))
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
        plot: x.plot ? String(x.plot) : undefined,
      })
    }
  }
  return out
}

/** Connections in use vs allowed, for the "max connections" message; null when the server won't say. */
export async function connInfo(s: Source, proxy: string): Promise<{ act: number; max: number } | null> {
  try {
    const ui = (await (await fetchT(px(api(s), proxy), 8000)).json())?.user_info
    const max = Number(ui?.max_connections) || 0
    return max ? { act: Number(ui.active_cons) || 0, max } : null
  } catch { return null }
}

export async function vodInfo(s: Source, proxy: string, sid: string) {
  const r = await call<{ info?: R; movie_data?: R }>(s, proxy, "get_vod_info", `&vod_id=${sid}`)
  return { ...r.info, added: r.movie_data?.added, container: r.movie_data?.container_extension } // streamInfo() reads these
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
        },
      })
    }
  }
  eps.sort((a, b) => a.season - b.season || a.num - b.num)
  return { info: r.info ?? {}, episodes: eps }
}
